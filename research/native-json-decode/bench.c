// Runtime API benchmark. Schema constructors reuse the upstream test fixture.
#define main runtime_test_main
#include "scr_json.test.c"
#undef main
#include <time.h>
bool scr_context_is_main(void) { return true; }
typedef struct { TestItem base; struct { uint32_t tag; uint64_t bits; } optional; } BenchItem;
static void *bench_item_new(void) { BenchItem *r=calloc(1,sizeof *r); assert(r); r->base.rc=1; test_items_live++; return r; }
static const ScrJsonSchemaField bench_fields[] = {
 {"sku",3,offsetof(BenchItem,base.sku),&test_str},
 {"qty",3,offsetof(BenchItem,base.qty),&test_f64},
 {"ok",2,offsetof(BenchItem,base.ok),&test_bool},
 {"tags",4,offsetof(BenchItem,base.tags),&test_tags},
 {"optional",8,offsetof(BenchItem,optional),&test_age},
};
static const ScrJsonSchema bench_item={SCR_JSCHEMA_REC,5,bench_fields,NULL,bench_item_new,NULL,test_item_release};
static const ScrJsonSchema bench_list={SCR_JSCHEMA_ARR,0,NULL,&bench_item,NULL,test_list_new,test_arr_release};
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }
int main(int argc, char **argv) {
  assert(argc == 5);
  FILE *f=fopen(argv[1], "rb"); assert(f); fseek(f,0,SEEK_END); long len=ftell(f); rewind(f);
  char *bytes=malloc(len+1); assert(fread(bytes,1,len,f)==(size_t)len); fclose(f);
  ScrStr *text=scr_str_new(bytes,len); free(bytes);
  int typed=atoi(argv[2]), loops=atoi(argv[3]);
  for(int i=-10;i<loops;i++) {
    double a=now();
    void *value=typed?scr_json_parse_schema(text,&bench_list):(void*)scr_json_parse(text);
    double b=now(); assert(value && !scr_exc_pending());
    double sum=0;
    if(typed) { ScrArr *arr=value; for(size_t j=0;j<arr->len;j++) { TestItem *r=((TestItem**)arr->data)[j]; sum+=r->qty+r->ok+r->sku->len+r->tags->len; BenchItem *br=(BenchItem*)r; if(br->optional.tag==0) {double x; memcpy(&x,&br->optional.bits,8); sum+=x;} } }
    else { ScrDyn *arr=value; for(size_t j=0;j<arr->v.arr.len;j++) { ScrDyn *r=arr->v.arr.items[j]; sum+=scr_dyn_obj_get(r,"qty",3)->v.num+scr_dyn_obj_get(r,"ok",2)->v.b+scr_dyn_obj_get(r,"sku",3)->v.str->len+scr_dyn_obj_get(r,"tags",4)->v.arr.len; ScrDyn *v=scr_dyn_obj_get(r,"optional",8); if(v)sum+=v->v.num; } }
    double c=now();
    if(typed) scr_arr_release(value); else scr_dyn_release(value);
    double d=now();
    if(i>=0 && !atoi(argv[4])) printf("%.6f %.6f %.6f %.0f\n",b-a,c-b,d-c,sum);
  }
  scr_str_release(text); scr_collect_cycles(); return 0;
}
