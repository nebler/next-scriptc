// All scriptc exports run on the permanent owner thread. No N-API calls in execute().
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
  struct {char *data; size_t len; double number; _Bool boolean;} inputs[64];
  char *output; size_t output_len; double number; _Bool boolean;
#ifdef BOUNDARY_TIMING
  double stages[4], input_ms, copy_ms;
#endif
  double sample_ms; int sample;
  int echo,failed; char error[1024];
#ifdef SERIALIZED_RUNTIME
  int serialized;
#endif
} Job;
typedef struct {uint32_t count; int kinds[64]; int result;} Schema;
#include <time.h>
static double stamp(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec*1000.0+t.tv_nsec/1e6;}
#ifdef BOUNDARY_TIMING
static _Thread_local Job *active_job;
static void stage(void *ctx,double n){(void)ctx;if(active_job&&n>=1&&n<=3)active_job->stages[(int)n]=stamp();}
extern int32_t rev_callbacks(const char *,void (*)(void),void *);
#endif
static void copy_output(Job *j,const uint8_t *out,size_t len){
#ifdef BOUNDARY_TIMING
 double begin=stamp();j->stages[3]=begin;
#endif
 j->output=malloc(len+1);
 if(!j->output){j->failed=1;strcpy(j->error,"host allocation failure");return;}
 memcpy(j->output,out,len);j->output[len]=0;j->output_len=len;
#ifdef BOUNDARY_TIMING
 j->copy_ms=stamp()-begin;
#endif
}
/* TABLE */
static void cleanup(Job *j){for(int i=0;i<64;i++)free(j->inputs[i].data);free(j->output);free(j);}
static napi_value result(napi_env env,Job *j){napi_value v;
#ifdef BOUNDARY_TIMING
 double begin=stamp();
#endif
 switch(schemas[j->echo].result){
 case 0:napi_create_string_utf8(env,j->output,j->output_len,&v);break;
 case 4:{void *data;napi_value buffer;napi_create_arraybuffer(env,j->output_len,&data,&buffer);memcpy(data,j->output,j->output_len);napi_create_typedarray(env,napi_uint8_array,j->output_len,buffer,0,&v);break;}
 case 1:napi_create_double(env,j->number,&v);break;
 case 2:napi_get_boolean(env,j->boolean,&v);break;
 default:napi_get_null(env,&v);
 }
#ifdef BOUNDARY_TIMING
 j->copy_ms+=stamp()-begin;
 napi_value wrapper,times,n;napi_create_object(env,&wrapper);napi_create_object(env,&times);
 const char *names[]={"nativeInputCopy","nativeDecode","compute","nativeEncode","copyBack"};
 double values[]={j->input_ms,j->stages[1]-j->stages[0],j->stages[2]-j->stages[1],j->stages[3]-j->stages[2],j->copy_ms};
 for(int i=0;i<5;i++){napi_create_double(env,values[i],&n);napi_set_named_property(env,times,names[i],n);}
 napi_set_named_property(env,wrapper,"value",v);napi_set_named_property(env,wrapper,"timings",times);return wrapper;
#else
 return v;
#endif
}
static void execute_raw(napi_env env,void *data) {
  (void)env;Job *j=data;
  if(poisoned){j->failed=1;strcpy(j->error,"scriptc instance is poisoned; restart process");return;}
  if(setjmp(trap)){j->failed=1;memcpy(j->error,panic_message,sizeof j->error);return;}
  if(!initialized){rev_sink(sink,NULL);
#ifdef BOUNDARY_TIMING
 rev_callbacks("boundaryStage",(void (*)(void))stage,NULL);
#endif
 rev_init();initialized=1;}
#ifdef BOUNDARY_TIMING
 active_job=j;j->stages[0]=stamp();
#endif
  entries[j->echo](j);
#ifdef BOUNDARY_TIMING
 active_job=NULL;
#endif
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
static void execute_service(napi_env env,void *data){
 (void)env;Job *j=data;pthread_once(&worker_once,start_worker);
 if(worker_error){j->failed=1;strcpy(j->error,"Cannot create dedicated scriptc thread");return;}
 Queue q={.job=j,.done_cv=PTHREAD_COND_INITIALIZER};
 pthread_mutex_lock(&queue_mu);if(tail)tail->next=&q;else head=&q;tail=&q;pthread_cond_signal(&queue_cv);
 while(!q.done)pthread_cond_wait(&q.done_cv,&queue_mu);
 pthread_mutex_unlock(&queue_mu);pthread_cond_destroy(&q.done_cv);
}
#else
static void execute_service(napi_env env,void *data){execute_raw(env,data);}
#endif
// Same owner handoff as run(), excluding only libuv queue/completion delay.
static void execute(napi_env env,void *data){Job *j=data;double begin=j->sample?stamp():0;execute_service(env,data);if(j->sample)j->sample_ms+=stamp()-begin;}
static void complete(napi_env env,napi_status status,void *data) {
  Job *j=data;napi_value v;
  if(status!=napi_ok||j->failed){napi_value msg;napi_create_string_utf8(env,j->failed?j->error:"async work cancelled",NAPI_AUTO_LENGTH,&msg);napi_create_error(env,NULL,msg,&v);napi_reject_deferred(env,j->deferred,v);}
  else {double begin=j->sample?stamp():0;v=result(env,j);
    if(j->sample){napi_value wrapper,n;napi_create_object(env,&wrapper);napi_create_double(env,j->sample_ms+stamp()-begin,&n);napi_set_named_property(env,wrapper,"value",v);napi_set_named_property(env,wrapper,"elapsedMs",n);v=wrapper;}
    napi_resolve_deferred(env,j->deferred,v);}
  napi_delete_async_work(env,j->work);cleanup(j);
}
static napi_value call(napi_env env,napi_callback_info info) {
  size_t argc=2;napi_value args[2],arg;void *kind;
  napi_get_cb_info(env,info,&argc,args,NULL,&kind);
  uint32_t index=0;
  if(argc!=2||napi_get_value_uint32(env,args[0],&index)!=napi_ok||index>=sizeof entries/sizeof *entries){napi_throw_type_error(env,NULL,"Invalid function id");return NULL;}
  arg=args[1];
  bool array=false;uint32_t length=0;
  if(napi_is_array(env,arg,&array)!=napi_ok||!array||napi_get_array_length(env,arg,&length)!=napi_ok||length!=schemas[index].count){napi_throw_type_error(env,NULL,"Expected encoded argument array");return NULL;}
  Job *j=calloc(1,sizeof *j);if(!j){napi_throw_error(env,NULL,"host allocation failure");return NULL;}
  j->echo=index;j->sample=((intptr_t)kind&2)!=0;double sample_begin=j->sample?stamp():0;
#ifdef BOUNDARY_TIMING
 double begin=stamp();
#endif
  for(uint32_t i=0;i<length;i++){
   napi_value a;napi_get_element(env,arg,i,&a);napi_status status;
   if(schemas[index].kinds[i]==0){
    status=napi_get_value_string_utf8(env,a,NULL,0,&j->inputs[i].len);
    if(status==napi_ok){j->inputs[i].data=malloc(j->inputs[i].len+1);if(!j->inputs[i].data){cleanup(j);napi_throw_error(env,NULL,"host allocation failure");return NULL;}status=napi_get_value_string_utf8(env,a,j->inputs[i].data,j->inputs[i].len+1,&j->inputs[i].len);}
   }else if(schemas[index].kinds[i]==4){
    napi_typedarray_type type;size_t length,offset;void *data;napi_value buffer;
    status=napi_get_typedarray_info(env,a,&type,&length,&data,&buffer,&offset);
    if(status==napi_ok&&type!=napi_uint8_array)status=napi_invalid_arg;
    if(status==napi_ok){j->inputs[i].data=malloc(length+1);if(!j->inputs[i].data){cleanup(j);napi_throw_error(env,NULL,"host allocation failure");return NULL;}memcpy(j->inputs[i].data,data,length);j->inputs[i].len=length;}
   }else if(schemas[index].kinds[i]==1)status=napi_get_value_double(env,a,&j->inputs[i].number);
   else {napi_valuetype type;napi_typeof(env,a,&type);if(type==napi_null){j->inputs[i].boolean=0;status=napi_ok;}else status=napi_get_value_bool(env,a,&j->inputs[i].boolean);}
   if(status!=napi_ok){cleanup(j);napi_throw_type_error(env,NULL,"Invalid encoded argument");return NULL;}
  }
#ifdef BOUNDARY_TIMING
 j->input_ms=stamp()-begin;
#endif
  if(j->sample)j->sample_ms=stamp()-sample_begin;
  napi_value v;
  if((intptr_t)kind&1){
    napi_value name;napi_create_string_utf8(env,"scriptc",NAPI_AUTO_LENGTH,&name);
    napi_create_promise(env,&j->deferred,&v);
    napi_status status=napi_create_async_work(env,NULL,name,execute,complete,j,&j->work);
    if(status==napi_ok)status=napi_queue_async_work(env,j->work);
    if(status!=napi_ok){if(j->work)napi_delete_async_work(env,j->work);cleanup(j);napi_throw_error(env,NULL,"Cannot queue scriptc work");return NULL;}
  } else {
    execute(env,j);
    if(j->failed){napi_throw_error(env,NULL,j->error);v=NULL;}
    else v=result(env,j);
    cleanup(j);
  }
  return v;
}
NAPI_MODULE_INIT(){
 napi_property_descriptor props[]={
 {"run",NULL,call,NULL,NULL,NULL,napi_default,(void *)0},
 {"runAsync",NULL,call,NULL,NULL,NULL,napi_default,(void *)1},
 {"runShadow",NULL,call,NULL,NULL,NULL,napi_default,(void *)3}};
 napi_define_properties(env,exports,sizeof props/sizeof *props,props);return exports;
}
