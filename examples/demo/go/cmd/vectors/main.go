// Kernel-only scout: the HTTP server imports these exact Go dot functions.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"next-scriptc-heavy/vectors"
	"os"
	"runtime"
	"sort"
	"strconv"
	"time"
)

func arg(i, fallback int) int {
	if len(os.Args) <= i {
		return fallback
	}
	n, e := strconv.Atoi(os.Args[i])
	if e != nil {
		panic(e)
	}
	return n
}
func main() {
	kind, variant := os.Args[1], os.Args[2]
	n, d, it, warm := arg(3, 100000), arg(4, 768), arg(5, 20), arg(6, 10)
	if n < 10 || d < 1 || d > 768 || it < 1 || warm < 0 {
		panic("size")
	}
	var ints, iq []int8
	var floats, fq []float32
	state := uint32(0x12345678)
	if kind == "float" {
		floats = make([]float32, n*d)
		fq = make([]float32, d)
	} else {
		ints = make([]int8, n*d)
		iq = make([]int8, d)
	}
	for j := 0; j < d; j++ {
		x := vectors.Sample(&state)
		if kind == "float" {
			fq[j] = float32(float64(x) / 127)
		} else {
			iq[j] = x
		}
	}
	for j := 0; j < n*d; j++ {
		x := vectors.Sample(&state)
		if kind == "float" {
			floats[j] = float32(float64(x) / 127)
		} else {
			ints[j] = x
		}
	}
	intDot := vectors.IntKernel(variant)
	floatDot := vectors.FloatPlain
	if variant == "unrolled" {
		floatDot = vectors.FloatUnrolled
	}
	if variant == "simd" {
		floatDot = vectors.FloatSIMD
	}
	ids := make([]int, 10)
	scores := make([]float64, 10)
	search := func() {
		for j := range scores {
			scores[j] = math.Inf(-1)
			ids[j] = -1
		}
		for row := 0; row < n; row++ {
			var score float64
			if kind == "float" {
				score = floatDot(floats[row*d:(row+1)*d], fq)
			} else {
				score = float64(intDot(ints[row*d:(row+1)*d], iq))
			}
			if score <= scores[9] {
				continue
			}
			j := 9
			for j > 0 && score > scores[j-1] {
				scores[j] = scores[j-1]
				ids[j] = ids[j-1]
				j--
			}
			scores[j] = score
			ids[j] = row
		}
	}
	search()
	expected, _ := json.Marshal([]any{ids, scores})
	for j := 0; j < warm; j++ {
		search()
	}
	times := make([]float64, it)
	for j := range times {
		start := time.Now()
		search()
		times[j] = float64(time.Since(start).Nanoseconds()) / 1e6
		actual, _ := json.Marshal([]any{ids, scores})
		if string(actual) != string(expected) {
			panic("unstable output")
		}
	}
	sorted := append([]float64{}, times...)
	sort.Float64s(sorted)
	result := map[string]any{"kind": kind, "variant": variant, "n": n, "d": d, "warmup": warm, "iterations": it, "times": times, "medianMs": sorted[len(sorted)/2], "p95Ms": sorted[int(math.Ceil(float64(it)*.95))-1], "ids": ids, "scores": scores, "simd": vectors.SIMD(), "go": runtime.Version()}
	b, e := json.Marshal(result)
	if e != nil {
		panic(e)
	}
	fmt.Println(string(b))
	runtime.KeepAlive(ints)
	runtime.KeepAlive(floats)
}
