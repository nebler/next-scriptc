package vectors

import "testing"

func TestSignedExtremesTailsAndSelection(t *testing.T) {
	for _, n := range []int{0, 1, 3, 15, 16, 17, 31, 32, 33, 384, 768} {
		a, b := make([]int8, n), make([]int8, n)
		state := uint32(123)
		for j := range a {
			a[j] = Sample(&state)
			b[j] = Sample(&state)
			if j%7 == 0 {
				a[j] = -128
				b[j] = -128
			}
		}
		want := IntPlain(a, b)
		if got := IntUnrolled(a, b); got != want {
			t.Fatalf("unrolled n=%d %d != %d", n, got, want)
		}
		if SIMD() != "unavailable" {
			if got := IntSIMD(a, b); got != want {
				t.Fatalf("simd n=%d %d != %d", n, got, want)
			}
		}
	}
	hits := Search(make([]int8, 20*3), make([]int8, 3), 20, IntUnrolled)
	for j, h := range hits {
		if h.ID != j || h.Score != 0 {
			t.Fatal(hits)
		}
	}
}
