// Shared by the scout and HTTP server. No goroutines: one query uses one core.
package vectors

import "math"

func IntPlain(a, b []int8) int32 {
	b = b[:len(a)]
	var sum int32
	for j, x := range a {
		sum += int32(x) * int32(b[j])
	}
	return sum
}
func IntUnrolled(a, b []int8) int32 {
	b = b[:len(a)]
	var s0, s1, s2, s3 int32
	j := 0
	for ; j+4 <= len(a); j += 4 {
		s0 += int32(a[j]) * int32(b[j])
		s1 += int32(a[j+1]) * int32(b[j+1])
		s2 += int32(a[j+2]) * int32(b[j+2])
		s3 += int32(a[j+3]) * int32(b[j+3])
	}
	for ; j < len(a); j++ {
		s0 += int32(a[j]) * int32(b[j])
	}
	return (s0 + s1) + (s2 + s3)
}
func FloatPlain(a, b []float32) float64 {
	b = b[:len(a)]
	sum := 0.0
	for j, x := range a {
		p := float64(float64(x) * float64(b[j]))
		sum += p
	}
	return sum
}
func FloatUnrolled(a, b []float32) float64 {
	b = b[:len(a)]
	var s0, s1, s2, s3 float64
	j := 0
	for ; j+4 <= len(a); j += 4 {
		p0 := float64(float64(a[j]) * float64(b[j]))
		p1 := float64(float64(a[j+1]) * float64(b[j+1]))
		p2 := float64(float64(a[j+2]) * float64(b[j+2]))
		p3 := float64(float64(a[j+3]) * float64(b[j+3]))
		s0 += p0
		s1 += p1
		s2 += p2
		s3 += p3
	}
	for ; j < len(a); j++ {
		p := float64(float64(a[j]) * float64(b[j]))
		s0 += p
	}
	return (s0 + s1) + (s2 + s3)
}

type Hit struct {
	ID    int   `json:"id"`
	Score int32 `json:"score"`
}

func IntKernel(name string) func([]int8, []int8) int32 {
	switch name {
	case "plain":
		return IntPlain
	case "unrolled":
		return IntUnrolled
	case "simd":
		if SIMD() == "unavailable" {
			panic("build with GOEXPERIMENT=simd on arm64 or AVX2 amd64")
		}
		return IntSIMD
	}
	panic("unknown vector kernel")
}
func Search(data, query []int8, n int, kernel func([]int8, []int8) int32) []Hit {
	hits := make([]Hit, 10)
	for j := range hits {
		hits[j] = Hit{-1, math.MinInt32}
	}
	d := len(query)
	for row := 0; row < n; row++ {
		score := kernel(data[row*d:(row+1)*d], query)
		if score <= hits[9].Score {
			continue
		}
		j := 9
		for j > 0 && score > hits[j-1].Score {
			hits[j] = hits[j-1]
			j--
		}
		hits[j] = Hit{row, score}
	}
	return hits
}
func Sample(state *uint32) int8 {
	*state ^= *state << 13
	*state ^= *state >> 17
	*state ^= *state << 5
	return int8(int(*state%255) - 127)
}
