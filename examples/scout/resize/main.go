package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image"
	"math"
	"os"
	"strconv"
	"time"

	"golang.org/x/image/draw"
)

func box(src, dst []byte, width, size int) {
	scale := width / size
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			for c := 0; c < 4; c++ {
				sum := 0
				for dy := 0; dy < scale; dy++ {
					for dx := 0; dx < scale; dx++ {
						sum += int(src[((y*scale+dy)*width+x*scale+dx)*4+c])
					}
				}
				dst[(y*size+x)*4+c] = byte(sum / (scale * scale))
			}
		}
	}
}

func bilinear(src, dst []byte, width, size int) {
	scale := float64(width) / float64(size)
	for y := 0; y < size; y++ {
		sy := (float64(y)+0.5)*scale - 0.5
		y0 := max(0, int(math.Floor(sy)))
		y1 := min(width-1, y0+1)
		fy := sy - float64(y0)
		for x := 0; x < size; x++ {
			sx := (float64(x)+0.5)*scale - 0.5
			x0 := max(0, int(math.Floor(sx)))
			x1 := min(width-1, x0+1)
			fx := sx - float64(x0)
			for c := 0; c < 4; c++ {
				a := float64(src[(y0*width+x0)*4+c])
				b := float64(src[(y0*width+x1)*4+c])
				d := float64(src[(y1*width+x0)*4+c])
				e := float64(src[(y1*width+x1)*4+c])
				top := a + (b-a)*fx
				bottom := d + (e-d)*fx
				dst[(y*size+x)*4+c] = byte(math.Floor(top + (bottom-top)*fy + 0.5))
			}
		}
	}
}

func integer(name string, fallback int) int {
	if s := os.Getenv(name); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			panic(err)
		}
		return n
	}
	return fallback
}
func main() {
	width, size := integer("WIDTH", 1024), integer("SIZE", 256)
	warmup, iterations := integer("WARMUP", 20), integer("ITERATIONS", 40)
	kind := os.Getenv("KIND")
	if kind == "" {
		kind = "box"
	}
	if width%size != 0 || width < size || size < 1 {
		panic("arguments")
	}
	src, dst := make([]byte, width*width*4), make([]byte, size*size*4)
	state := uint32(42)
	for i := 0; i < len(src); i += 4 {
		state = state*1664525 + 1013904223
		src[i] = byte(state >> 24)
		src[i+1] = byte(state >> 16)
		src[i+2] = byte(state >> 8)
		src[i+3] = 255
	}
	input := &image.RGBA{Pix: src, Stride: width * 4, Rect: image.Rect(0, 0, width, width)}
	output := &image.RGBA{Pix: dst, Stride: size * 4, Rect: image.Rect(0, 0, size, size)}
	run := func() {
		switch kind {
		case "box":
			box(src, dst, width, size)
		case "bilinear":
			bilinear(src, dst, width, size)
		case "ximage-approx":
			draw.ApproxBiLinear.Scale(output, output.Bounds(), input, input.Bounds(), draw.Src, nil)
		case "ximage":
			draw.BiLinear.Scale(output, output.Bounds(), input, input.Bounds(), draw.Src, nil)
		default:
			panic("kind")
		}
	}
	for i := 0; i < warmup; i++ {
		run()
	}
	samples := make([]float64, iterations)
	sink := 0
	for i := 0; i < iterations; i++ {
		start := time.Now()
		run()
		samples[i] = float64(time.Since(start).Nanoseconds()) / 1e6
		sink += int(dst[(i*997)%len(dst)])
	}
	hash := sha256.Sum256(dst)
	if file := os.Getenv("OUTPUT"); file != "" {
		if err := os.WriteFile(file, dst, 0600); err != nil {
			panic(err)
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"kind": kind, "width": width, "size": size, "warmup": warmup, "iterations": iterations, "samples": samples, "sink": sink, "sha256": hex.EncodeToString(hash[:])}); err != nil {
		panic(err)
	}
}
