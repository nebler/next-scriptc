//go:build goexperiment.simd && arm64

package vectors

import "simd/archsimd"

func SIMD() string { return "Go 1.27.3 experimental archsimd NEON 128-bit" }
func IntSIMD(a, b []int8) int32 {
	b = b[:len(a)]
	var s0, s1, s2, s3 archsimd.Int32x4
	j := 0
	for ; j+16 <= len(a); j += 16 {
		x := archsimd.LoadInt8x16(a[j:])
		y := archsimd.LoadInt8x16(b[j:])
		lo := x.MulWidenLo(y)
		hi := x.HiToLo().MulWidenLo(y.HiToLo())
		s0 = s0.Add(lo.ExtendLo4ToInt32())
		s1 = s1.Add(lo.HiToLo().ExtendLo4ToInt32())
		s2 = s2.Add(hi.ExtendLo4ToInt32())
		s3 = s3.Add(hi.HiToLo().ExtendLo4ToInt32())
	}
	sum := s0.Add(s1).Add(s2.Add(s3)).ReduceSum()
	for ; j < len(a); j++ {
		sum += int32(a[j]) * int32(b[j])
	}
	return sum
}
func FloatSIMD(a, b []float32) float64 {
	b = b[:len(a)]
	var s0, s1 archsimd.Float64x2
	j := 0
	for ; j+4 <= len(a); j += 4 {
		x := archsimd.LoadFloat32x4(a[j:])
		y := archsimd.LoadFloat32x4(b[j:])
		s0 = s0.Add(x.ConvertLo2ToFloat64().Mul(y.ConvertLo2ToFloat64()))
		s1 = s1.Add(x.HiToLo().ConvertLo2ToFloat64().Mul(y.HiToLo().ConvertLo2ToFloat64()))
	}
	s := s0.Add(s1)
	sum := s.GetElem(0) + s.GetElem(1)
	for ; j < len(a); j++ {
		p := float64(float64(a[j]) * float64(b[j]))
		sum += p
	}
	return sum
}
