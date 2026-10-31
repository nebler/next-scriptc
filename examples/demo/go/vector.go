package main

import (
	"encoding/json"
	"net/http"
	"next-scriptc-heavy/vectors"
	"strconv"
	"sync"
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
	writeJSON(w, struct {
		Results []vectors.Hit `json:"results"`
	}{hits})
}
