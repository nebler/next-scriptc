package main

import (
	"encoding/json"
	"net/http"
	"next-scriptc-heavy/vectors"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const vectorRows = 100000
const vectorDimensions = 768

var vectorOnce sync.Once
var vectorCorpus []int8
var vectorInitMs float64

// Initialize when the server starts, just as the native route module does.
func initVectors() {
	vectorOnce.Do(func() {
		start := time.Now()
		vectorCorpus = make([]int8, vectorRows*vectorDimensions)
		state := uint32(0x12345678)
		for j := range vectorCorpus {
			vectorCorpus[j] = vectors.Sample(&state)
		}
		vectorInitMs = float64(time.Since(start).Nanoseconds()) / 1e6
	})
}
func vectorSearch(w http.ResponseWriter, r *http.Request) {
	b, e := body(w, r)
	var before syscall.Rusage
	measured := os.Getenv("VECTOR_VERCEL_TIMING") == "1"
	if measured {
		syscall.Getrusage(syscall.RUSAGE_SELF, &before)
	}
	start := time.Now()
	var input struct {
		Embedding []*float64 `json:"embedding"`
	}
	if e != nil || len(b) > 8192 || json.Unmarshal(b, &input) != nil || len(input.Embedding) != vectorDimensions {
		invalid(w)
		return
	}
	query := make([]int8, vectorDimensions)
	for j, x := range input.Embedding {
		if !bounded(x, -128, 127) {
			invalid(w)
			return
		}
		query[j] = int8(*x)
	}
	name := r.URL.Query().Get("kernel")
	if name == "" {
		name = "unrolled"
	}
	if name != "plain" && name != "unrolled" && name != "simd" {
		invalid(w)
		return
	}
	if name == "simd" && vectors.SIMD() == "unavailable" {
		http.Error(w, "SIMD unavailable; build with GOEXPERIMENT=simd", 503)
		return
	}
	hits := vectors.Search(vectorCorpus, query, vectorRows, vectors.IntKernel(name))
	w.Header().Set("x-vector-init-ms", strconv.FormatFloat(vectorInitMs, 'f', 6, 64))
	payload, err := json.Marshal(struct {
		Results []vectors.Hit `json:"results"`
	}{hits})
	if err != nil {
		panic(err)
	}
	computeMs := float64(time.Since(start).Nanoseconds()) / 1e6
	if measured {
		var after syscall.Rusage
		syscall.Getrusage(syscall.RUSAGE_SELF, &after)
		micros := func(u syscall.Rusage) int64 {
			return u.Utime.Sec*1000000 + int64(u.Utime.Usec) + u.Stime.Sec*1000000 + int64(u.Stime.Usec)
		}
		w.Header().Set("Server-Timing", "compute;dur="+strconv.FormatFloat(computeMs, 'f', 6, 64))
		w.Header().Set("x-vector-cpu-us", strconv.FormatInt(micros(after)-micros(before), 10))
		rss := int64(0)
		for _, line := range strings.Split(file("/proc/self/status"), "\n") {
			if strings.HasPrefix(line, "VmRSS:") {
				n, _ := strconv.ParseInt(strings.Fields(line)[1], 10, 64)
				rss = n * 1024
			}
		}
		w.Header().Set("x-vector-rss", strconv.FormatInt(rss, 10))
		w.Header().Set("x-vector-instance", instance)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(payload)
}
