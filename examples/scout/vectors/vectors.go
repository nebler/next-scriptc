package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/bits"
	"os"
	"runtime"
	"sort"
	"strconv"
	"time"
)

func insert(score float64, id int, scores []float64, ids []int) {
	if score <= scores[9] {
		return
	}
	j := 9
	for j > 0 && score > scores[j-1] {
		scores[j] = scores[j-1]
		ids[j] = ids[j-1]
		j--
	}
	scores[j] = score
	ids[j] = id
}
func floatSearch(data, query []float32, n, d int, scores []float64, ids []int) {
	for row := 0; row < n; row++ {
		sum := 0.0
		// Row slice proves the inner data bound once, an idiomatic Go representation.
		vector := data[row*d : (row+1)*d]
		for j, x := range vector {
			// Explicit rounding prevents Go's permitted FMA from changing JS semantics.
			product := float64(float64(x) * float64(query[j]))
			sum += product
		}
		insert(sum, row, scores, ids)
	}
}
func int8Search(data, query []int8, n, d int, scores []float64, ids []int) {
	for row := 0; row < n; row++ {
		var sum int32
		vector := data[row*d : (row+1)*d]
		for j, x := range vector {
			sum += int32(x) * int32(query[j])
		}
		insert(float64(sum), row, scores, ids)
	}
}
func popcount(x uint32) int {
	x = x - ((x >> 1) & 0x55555555)
	x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
	x = (x + (x >> 4)) & 0x0f0f0f0f
	return int((x * 0x01010101) >> 24)
}
func binarySearch(data, query []uint32, n, words int, intrinsic bool, scores []float64, ids []int) {
	for row := 0; row < n; row++ {
		distance := 0
		vector := data[row*words : (row+1)*words]
		if intrinsic {
			for j, x := range vector {
				distance += bits.OnesCount32(x ^ query[j])
			}
		} else {
			for j, x := range vector {
				distance += popcount(x ^ query[j])
			}
		}
		insert(float64(-distance), row, scores, ids)
	}
}

var state uint32 = 0x12345678

func sample() int8 {
	state ^= state << 13
	state ^= state >> 17
	state ^= state << 5
	return int8(int(state%255) - 127)
}
func arg(index, fallback int) int {
	if len(os.Args) <= index {
		return fallback
	}
	v, err := strconv.Atoi(os.Args[index])
	if err != nil {
		panic(err)
	}
	return v
}
func main() {
	kind := "float"
	if len(os.Args) > 1 {
		kind = os.Args[1]
	}
	n, d, iterations, warmup := arg(2, 20000), arg(3, 384), arg(4, 30), arg(5, 10)
	if n < 10 || d < 32 || d%32 != 0 || d > 768 || iterations < 1 {
		panic("invalid size")
	}
	var f, fq []float32
	var i, iq []int8
	var b, bq []uint32
	if kind == "float" {
		f = make([]float32, n*d)
		fq = make([]float32, d)
	} else if kind == "binary" || kind == "binary-plain" {
		b = make([]uint32, n*d/32)
		bq = make([]uint32, d/32)
	} else {
		i = make([]int8, n*d)
		iq = make([]int8, d)
	}
	for j := 0; j < d; j++ {
		x := sample()
		if f != nil {
			fq[j] = float32(float64(x) / 127)
		} else if b != nil {
			if x > 0 {
				bq[j>>5] |= 1 << (j & 31)
			}
		} else {
			iq[j] = x
		}
	}
	for j := 0; j < n*d; j++ {
		x := sample()
		if f != nil {
			f[j] = float32(float64(x) / 127)
		} else if b != nil {
			if x > 0 {
				b[j>>5] |= 1 << (j & 31)
			}
		} else {
			i[j] = x
		}
	}
	scores, ids := make([]float64, 10), make([]int, 10)
	search := func() {
		for j := range scores {
			scores[j] = math.Inf(-1)
			ids[j] = -1
		}
		switch kind {
		case "float":
			floatSearch(f, fq, n, d, scores, ids)
		case "int8", "int8-i32", "int8-imul":
			int8Search(i, iq, n, d, scores, ids)
		case "binary", "binary-plain":
			binarySearch(b, bq, n, d/32, kind == "binary", scores, ids)
		default:
			panic("unknown kind")
		}
	}
	search()
	expected, _ := json.Marshal([]any{ids, scores})
	for rep := 0; rep < warmup; rep++ {
		search()
	}
	times := make([]float64, iterations)
	for rep := range times {
		start := time.Now()
		search()
		times[rep] = float64(time.Since(start).Nanoseconds()) / 1e6
		actual, _ := json.Marshal([]any{ids, scores})
		if string(actual) != string(expected) {
			panic("unstable result")
		}
	}
	sort.Float64s(times)
	result := map[string]any{"kind": kind, "n": n, "d": d, "iterations": iterations, "warmup": warmup, "medianMs": times[len(times)/2], "p95Ms": times[int(math.Ceil(float64(len(times))*.95))-1], "times": times, "ids": ids, "scores": scores}
	encoded, err := json.Marshal(result)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(encoded))
	runtime.KeepAlive(f)
	runtime.KeepAlive(i)
	runtime.KeepAlive(b)
}
