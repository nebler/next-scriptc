// Each calling OS thread owns one scriptc instance. No N-API calls in execute().
#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <setjmp.h>
#include <stdio.h>
#include <signal.h>
#ifdef __APPLE__
#include <mach/mach.h>
#endif
extern void rev_init(void);
extern void rev_collect(void);
extern void rev_sink(void (*)(void *, const uint8_t *, size_t, uint64_t), void *);
extern void rev_run(const uint8_t *, size_t, const uint8_t **, size_t *);
extern void rev_echo(const uint8_t *, size_t, const uint8_t **, size_t *);
static _Thread_local int initialized, poisoned;
static _Thread_local jmp_buf trap;
static _Thread_local char panic_message[1024];
static void sink(void *ctx,const uint8_t *msg,size_t len,uint64_t addr) {
  (void)ctx;(void)addr;
  if(len>=sizeof panic_message)len=sizeof panic_message-1;
  memcpy(panic_message,msg,len);panic_message[len]=0;poisoned=1;
  longjmp(trap,1); // Leave poisoned instance permanently unused.
}
typedef struct {
  napi_async_work work; napi_deferred deferred;
  char *input,*output; size_t input_len,output_len;
  int echo,failed; char error[1024];
#ifdef SERIALIZED_RUNTIME
  int serialized;
#endif
} Job;
static void execute_raw(napi_env env,void *data) {
  (void)env;Job *j=data;
  if(poisoned){j->failed=1;strcpy(j->error,"scriptc instance is poisoned; restart process");return;}
  if(setjmp(trap)){j->failed=1;memcpy(j->error,panic_message,sizeof j->error);return;}
  if(!initialized){rev_sink(sink,NULL);rev_init();initialized=1;}
  const uint8_t *out=NULL;size_t len=0;
  if(j->echo)rev_echo((uint8_t *)j->input,j->input_len,&out,&len);
  else rev_run((uint8_t *)j->input,j->input_len,&out,&len);
  // Copy module-owned bytes before another export resets the result arena.
  j->output=malloc(len+1);
  if(!j->output){j->failed=1;strcpy(j->error,"host allocation failure");return;}
  memcpy(j->output,out,len);j->output[len]=0;j->output_len=len;
}
#ifdef SERIALIZED_RUNTIME
// A default scriptc instance may never move between OS threads, even under
// a mutex. Route every entry to one permanent owning pthread instead.
typedef struct Queue { Job *job; struct Queue *next; int done; pthread_cond_t done_cv; } Queue;
static pthread_mutex_t queue_mu=PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t queue_cv=PTHREAD_COND_INITIALIZER;
static pthread_once_t worker_once=PTHREAD_ONCE_INIT;
static Queue *head,*tail;
static int worker_error;
static void *worker_main(void *unused){
 (void)unused;
 for(;;){
  pthread_mutex_lock(&queue_mu);
  while(!head)pthread_cond_wait(&queue_cv,&queue_mu);
  Queue *q=head;head=q->next;if(!head)tail=NULL;
  pthread_mutex_unlock(&queue_mu);
  execute_raw(NULL,q->job);
  pthread_mutex_lock(&queue_mu);q->done=1;pthread_cond_signal(&q->done_cv);pthread_mutex_unlock(&queue_mu);
 }
 return NULL;
}
static void start_worker(void){pthread_t t;worker_error=pthread_create(&t,NULL,worker_main,NULL);if(!worker_error)pthread_detach(t);}
static void execute(napi_env env,void *data){
 (void)env;Job *j=data;pthread_once(&worker_once,start_worker);
 if(worker_error){j->failed=1;strcpy(j->error,"Cannot create dedicated scriptc thread");return;}
 Queue q={.job=j,.done_cv=PTHREAD_COND_INITIALIZER};
 pthread_mutex_lock(&queue_mu);if(tail)tail->next=&q;else head=&q;tail=&q;pthread_cond_signal(&queue_cv);
 while(!q.done)pthread_cond_wait(&q.done_cv,&queue_mu);
 pthread_mutex_unlock(&queue_mu);pthread_cond_destroy(&q.done_cv);
}
#else
static void execute(napi_env env,void *data){execute_raw(env,data);}
#endif
static void complete(napi_env env,napi_status status,void *data) {
  Job *j=data;napi_value v;
  if(status!=napi_ok||j->failed){napi_value msg;napi_create_string_utf8(env,j->failed?j->error:"async work cancelled",NAPI_AUTO_LENGTH,&msg);napi_create_error(env,NULL,msg,&v);napi_reject_deferred(env,j->deferred,v);}
  else {napi_create_string_utf8(env,j->output,j->output_len,&v);napi_resolve_deferred(env,j->deferred,v);}
  napi_delete_async_work(env,j->work);free(j->input);free(j->output);free(j);
}
static napi_value call(napi_env env,napi_callback_info info) {
  size_t argc=1;napi_value arg;void *kind;
  napi_get_cb_info(env,info,&argc,&arg,NULL,&kind);
  napi_valuetype type;
  if(argc!=1||napi_typeof(env,arg,&type)!=napi_ok||type!=napi_string){napi_throw_type_error(env,NULL,"Expected one JSON string");return NULL;}
  Job *j=calloc(1,sizeof *j);if(!j){napi_throw_error(env,NULL,"host allocation failure");return NULL;}
  j->echo=((intptr_t)kind&2)!=0;
  napi_get_value_string_utf8(env,arg,NULL,0,&j->input_len);
  j->input=malloc(j->input_len+1);
  if(!j->input){free(j);napi_throw_error(env,NULL,"host allocation failure");return NULL;}
  napi_get_value_string_utf8(env,arg,j->input,j->input_len+1,&j->input_len);
  napi_value v;
  if((intptr_t)kind&1){
    napi_value name;napi_create_string_utf8(env,"scriptc",NAPI_AUTO_LENGTH,&name);
    napi_create_promise(env,&j->deferred,&v);
    napi_status status=napi_create_async_work(env,NULL,name,execute,complete,j,&j->work);
    if(status==napi_ok)status=napi_queue_async_work(env,j->work);
    if(status!=napi_ok){if(j->work)napi_delete_async_work(env,j->work);free(j->input);free(j);napi_throw_error(env,NULL,"Cannot queue scriptc work");return NULL;}
  } else {
    execute(env,j);
    if(j->failed){napi_throw_error(env,NULL,j->error);v=NULL;}
    else napi_create_string_utf8(env,j->output,j->output_len,&v);
    free(j->input);free(j->output);free(j);
  }
  return v;
}
static napi_value collect(napi_env env,napi_callback_info info){(void)info;napi_value v;if(initialized&&!poisoned)rev_collect();napi_get_undefined(env,&v);return v;}
// Read-only process diagnostics: signals before/after init; thread count on macOS.
static napi_value diagnostics(napi_env env,napi_callback_info info){
 (void)info;napi_value obj,v;napi_create_object(env,&obj);
 int signals[]={SIGINT,SIGTERM,SIGPIPE,SIGSEGV,SIGBUS,SIGABRT,SIGUSR1,SIGUSR2};
 const char *names[]={"SIGINT","SIGTERM","SIGPIPE","SIGSEGV","SIGBUS","SIGABRT","SIGUSR1","SIGUSR2"};
 for(size_t i=0;i<8;i++){struct sigaction a;sigaction(signals[i],NULL,&a);char p[64];snprintf(p,sizeof p,"%p",(void *)a.sa_handler);napi_create_string_utf8(env,p,NAPI_AUTO_LENGTH,&v);napi_set_named_property(env,obj,names[i],v);}
#ifdef __APPLE__
 thread_act_array_t list;mach_msg_type_number_t count;
 if(task_threads(mach_task_self(),&list,&count)==KERN_SUCCESS){napi_create_uint32(env,count,&v);napi_set_named_property(env,obj,"threads",v);for(unsigned i=0;i<count;i++)mach_port_deallocate(mach_task_self(),list[i]);vm_deallocate(mach_task_self(),(vm_address_t)list,count*sizeof *list);}
#endif
 return obj;
}
NAPI_MODULE_INIT(){
 napi_property_descriptor props[]={
 {"revenueJson",NULL,call,NULL,NULL,NULL,napi_default,(void *)0},
 {"revenueJsonAsync",NULL,call,NULL,NULL,NULL,napi_default,(void *)1},
 {"echo",NULL,call,NULL,NULL,NULL,napi_default,(void *)2},
 {"echoAsync",NULL,call,NULL,NULL,NULL,napi_default,(void *)3},
 {"collect",NULL,collect,NULL,NULL,NULL,napi_default,NULL},
 {"diagnostics",NULL,diagnostics,NULL,NULL,NULL,napi_default,NULL}};
 napi_define_properties(env,exports,sizeof props/sizeof *props,props);return exports;
}
