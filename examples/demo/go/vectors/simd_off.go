//go:build !goexperiment.simd || (!arm64 && !amd64)

package vectors

func SIMD() string                     { return "unavailable" }
func IntSIMD(a, b []int8) int32        { panic("SIMD unavailable") }
func FloatSIMD(a, b []float32) float64 { panic("SIMD unavailable") }
