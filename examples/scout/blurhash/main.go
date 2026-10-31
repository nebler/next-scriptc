package main

import (
	"encoding/json"
	"fmt"
	blurhash "github.com/buckket/go-blurhash"
	"image"
	"math"
	"os"
	"runtime/pprof"
	"strconv"
	"time"
)

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

var linear [256]float64

func init() {
	for i := range linear {
		v := float64(i) / 255
		if v <= 0.04045 {
			linear[i] = v / 12.92
		} else {
			linear[i] = math.Pow((v+0.055)/1.055, 2.4)
		}
	}
}
func base83(v, n int) string {
	b := make([]byte, n)
	for i := n - 1; i >= 0; i-- {
		b[i] = alphabet[v%83]
		v /= 83
	}
	return string(b)
}
func srgb(v float64) int {
	v = math.Max(0, math.Min(1, v))
	if v <= 0.0031308 {
		v *= 12.92
	} else {
		v = 1.055*math.Pow(v, 1/2.4) - 0.055
	}
	return int(math.Floor(v*255 + 0.5))
}
func quant(v, maximum float64) int {
	v /= maximum
	return int(math.Max(0, math.Min(18, math.Floor(math.Copysign(math.Pow(math.Abs(v), 0.5), v)*9+9.5))))
}

// Same pixel/component order and operations as TS. Explicit float64 conversions
// prevent Go's optional fused multiply-add from changing JS's rounding semantics.
func encode(pixels []byte, width, height int, componentMajor bool) string {
	xs := make([]float64, 4*width)
	ys := make([]float64, 3*height)
	var factors [36]float64
	for xc := 0; xc < 4; xc++ {
		for x := 0; x < width; x++ {
			xs[xc*width+x] = math.Cos(math.Pi * float64(xc) * float64(x) / float64(width))
		}
	}
	for yc := 0; yc < 3; yc++ {
		for y := 0; y < height; y++ {
			ys[yc*height+y] = math.Cos(math.Pi * float64(yc) * float64(y) / float64(height))
		}
	}
	scaleDC, scaleAC := 1/float64(width*height), 2/float64(width*height)
	if componentMajor {
		for yc := 0; yc < 3; yc++ {
			for xc := 0; xc < 4; xc++ {
				scale := scaleAC
				if xc == 0 && yc == 0 {
					scale = scaleDC
				}
				var rsum, gsum, bsum float64
				for y := 0; y < height; y++ {
					by := ys[yc*height+y]
					for x := 0; x < width; x++ {
						p := (y*width + x) * 4
						r, g, b := linear[pixels[p]], linear[pixels[p+1]], linear[pixels[p+2]]
						basis := xs[xc*width+x] * by
						rsum += float64(float64(r*basis) * scale)
						gsum += float64(float64(g*basis) * scale)
						bsum += float64(float64(b*basis) * scale)
					}
				}
				f := (xc + yc*4) * 3
				factors[f], factors[f+1], factors[f+2] = rsum, gsum, bsum
			}
		}
	} else {
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				p := (y*width + x) * 4
				r, g, b := linear[pixels[p]], linear[pixels[p+1]], linear[pixels[p+2]]
				for yc := 0; yc < 3; yc++ {
					for xc := 0; xc < 4; xc++ {
						scale := scaleDC
						if xc != 0 || yc != 0 {
							scale = scaleAC
						}
						basis := xs[xc*width+x] * ys[yc*height+y]
						f := (xc + yc*4) * 3
						factors[f] += float64(float64(r*basis) * scale)
						factors[f+1] += float64(float64(g*basis) * scale)
						factors[f+2] += float64(float64(b*basis) * scale)
					}
				}
			}
		}
	}
	maximum := 0.0
	for i := 3; i < 36; i++ {
		maximum = math.Max(math.Abs(factors[i]), maximum)
	}
	q := int(math.Max(0, math.Min(82, math.Floor(maximum*166-0.5))))
	maximum = float64(q+1) / 166
	hash := base83(21, 1) + base83(q, 1) + base83((srgb(factors[0])<<16)+(srgb(factors[1])<<8)+srgb(factors[2]), 4)
	for i := 3; i < 36; i += 3 {
		hash += base83(quant(factors[i], maximum)*361+quant(factors[i+1], maximum)*19+quant(factors[i+2], maximum), 2)
	}
	return hash
}
func integer(i int, fallback int) int {
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
	size, iterations, warmup := integer(2, 512), integer(3, 30), integer(4, 5)
	rgba := image.NewRGBA(image.Rect(0, 0, size, size))
	pixels := rgba.Pix
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			p := (y*size + x) * 4
			pixels[p] = byte(x * 255 / (size - 1))
			pixels[p+1] = byte(y * 255 / (size - 1))
			pixels[p+2] = byte((x ^ y) + ((x * y) >> 8))
			pixels[p+3] = 255
		}
	}
	fn := func() string { return encode(pixels, size, size, os.Args[1] == "components") }
	if os.Args[1] == "library" {
		fn = func() string {
			s, e := blurhash.Encode(4, 3, rgba)
			if e != nil {
				panic(e)
			}
			return s
		}
	} else if os.Args[1] != "port" && os.Args[1] != "components" {
		panic("mode: library, port or components")
	}
	if profile := os.Getenv("BLURHASH_GO_PROFILE"); profile != "" {
		f, e := os.Create(profile)
		if e != nil {
			panic(e)
		}
		if e = pprof.StartCPUProfile(f); e != nil {
			panic(e)
		}
		defer pprof.StopCPUProfile()
	}
	expected := fn()
	for i := 0; i < warmup; i++ {
		if fn() != expected {
			panic("warmup parity")
		}
	}
	samples := make([]float64, iterations)
	for i := range samples {
		start := time.Now()
		hash := fn()
		samples[i] = float64(time.Since(start).Nanoseconds()) / 1e6
		if hash != expected {
			panic("hash parity")
		}
	}
	out := struct {
		Size       int       `json:"size"`
		Iterations int       `json:"iterations"`
		Warmup     int       `json:"warmup"`
		Hash       string    `json:"hash"`
		Samples    []float64 `json:"samples"`
	}{size, iterations, warmup, expected, samples}
	b, e := json.Marshal(out)
	if e != nil {
		panic(e)
	}
	fmt.Println(string(b))
}
