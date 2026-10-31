//go:build goexperiment.simd && amd64

package vectors

import "simd/archsimd"

func SIMD() string {
	if !archsimd.X86.AVX2() {
		return "unavailable"
	}
	return "Go 1.27.3 experimental archsimd AVX2 256-bit"
}
func IntSIMD(a, b []int8) int32 {
	b = b[:len(a)]
	var s0, s1 archsimd.Int32x8
	j := 0
	for ; j+32 <= len(a); j += 32 {
		x0 := archsimd.LoadInt8x16(a[j:]).ExtendToInt16()
		y0 := archsimd.LoadInt8x16(b[j:]).ExtendToInt16()
		x1 := archsimd.LoadInt8x16(a[j+16:]).ExtendToInt16()
		y1 := archsimd.LoadInt8x16(b[j+16:]).ExtendToInt16()
		s0 = s0.Add(x0.DotProductPairs(y0))
		s1 = s1.Add(x1.DotProductPairs(y1))
	}
	var lanes [8]int32
	s0.Add(s1).Store(lanes[:])
	var sum int32
	for _, x := range lanes {
		sum += x
	}
	for ; j < len(a); j++ {
		sum += int32(a[j]) * int32(b[j])
	}
	return sum
}
func FloatSIMD(a, b []float32) float64 {
	b = b[:len(a)]
	var s0, s1 archsimd.Float64x4
	j := 0
	for ; j+8 <= len(a); j += 8 {
		x0 := archsimd.LoadFloat32x4(a[j:]).ConvertToFloat64()
		y0 := archsimd.LoadFloat32x4(b[j:]).ConvertToFloat64()
		x1 := archsimd.LoadFloat32x4(a[j+4:]).ConvertToFloat64()
		y1 := archsimd.LoadFloat32x4(b[j+4:]).ConvertToFloat64()
		s0 = s0.Add(x0.Mul(y0))
		s1 = s1.Add(x1.Mul(y1))
	}
	var lanes [4]float64
	s0.Add(s1).Store(lanes[:])
	sum := 0.0
	for _, x := range lanes {
		sum += x
	}
	for ; j < len(a); j++ {
		p := float64(float64(a[j]) * float64(b[j]))
		sum += p
	}
	return sum
}
