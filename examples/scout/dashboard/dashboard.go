package main

import (
	"bytes"
	"encoding/json"
	jsonv2 "encoding/json/v2"
	"fmt"
	"os"
	"runtime/pprof"
	"slices"
	"strconv"
	"strings"
	"time"
)

type Event struct {
	Day         string `json:"day"`
	Region      string `json:"region"`
	AmountCents int64  `json:"amountCents"`
	Quantity    int64  `json:"quantity"`
}
type Daily struct {
	Day          string `json:"day"`
	Region       string `json:"region"`
	RevenueCents int64  `json:"revenueCents"`
	Units        int64  `json:"units"`
	Events       int    `json:"events"`
}
type Result struct {
	From         string   `json:"from"`
	To           string   `json:"to"`
	Events       int      `json:"events"`
	RevenueCents int64    `json:"revenueCents"`
	Daily        []*Daily `json:"daily"`
	Timings      any      `json:"timings"`
}
type Phase struct {
	ParseMs     float64 `json:"parseMs"`
	GroupMs     float64 `json:"groupMs"`
	SortMs      float64 `json:"sortMs"`
	RemainderMs float64 `json:"remainderMs"`
}
type Key struct{ Day, Region string }

func ms(d time.Duration) float64 { return float64(d) / float64(time.Millisecond) }

func revenue(input []byte, from, to string, variant string, profile bool) (Result, Phase) {
	var begin, parsed, grouped time.Time
	if profile {
		begin = time.Now()
	}
	var events []Event
	streaming := variant == "stream"
	if variant == "v2" {
		if err := jsonv2.Unmarshal(input, &events); err != nil {
			panic(err)
		}
	} else if !streaming {
		if err := json.Unmarshal(input, &events); err != nil {
			panic(err)
		}
	}
	if profile {
		parsed = time.Now()
	}
	totals := make(map[Key]*Daily)
	result := Result{From: from, To: to}
	add := func(event Event) {
		if event.Day < from || event.Day > to {
			return
		}
		key := Key{event.Day, event.Region}
		total := totals[key]
		if total == nil {
			total = &Daily{Day: event.Day, Region: event.Region}
			totals[key] = total
		}
		amount := event.AmountCents * event.Quantity
		total.RevenueCents += amount
		total.Units += event.Quantity
		total.Events++
		result.Events++
		result.RevenueCents += amount
	}
	if streaming {
		// Common memory-saving stdlib idiom. Decode one typed record at a time;
		// its parse and grouping phases are interleaved (reported as groupMs).
		decoder := json.NewDecoder(bytes.NewReader(input))
		if token, err := decoder.Token(); err != nil || token != json.Delim('[') {
			panic("expected array")
		}
		for decoder.More() {
			var event Event
			if err := decoder.Decode(&event); err != nil {
				panic(err)
			}
			add(event)
		}
		if token, err := decoder.Token(); err != nil || token != json.Delim(']') {
			panic("expected end")
		}
	} else {
		for _, event := range events {
			add(event)
		}
	}
	if profile {
		grouped = time.Now()
	}
	result.Daily = make([]*Daily, 0, len(totals))
	for _, total := range totals {
		result.Daily = append(result.Daily, total)
	}
	slices.SortFunc(result.Daily, func(a, b *Daily) int {
		if order := strings.Compare(a.Day, b.Day); order != 0 {
			return order
		}
		return strings.Compare(a.Region, b.Region)
	})
	phase := Phase{}
	if profile {
		phase.ParseMs = ms(parsed.Sub(begin))
		phase.GroupMs = ms(grouped.Sub(parsed))
		phase.SortMs = ms(time.Since(grouped))
	}
	return result, phase
}

func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
func main() {
	input, err := os.ReadFile(os.Getenv("INPUT"))
	if err != nil {
		panic(err)
	}
	count, _ := strconv.Atoi(env("ITERATIONS", "40"))
	warmup, _ := strconv.Atoi(env("WARMUP", "10"))
	profile := os.Getenv("PROFILE") == "1"
	if path := os.Getenv("CPUPROFILE"); path != "" {
		f, err := os.Create(path)
		if err != nil {
			panic(err)
		}
		if err := pprof.StartCPUProfile(f); err != nil {
			panic(err)
		}
		defer f.Close()
		defer pprof.StopCPUProfile()
	}
	samples := []float64{}
	phases := []Phase{}
	var expected []byte
	from, to, variant := env("FROM", "2026-01-01"), env("TO", "2026-01-31"), os.Getenv("VARIANT")
	for i := -warmup; i < count; i++ {
		start := time.Now()
		result, phase := revenue(input, from, to, variant, profile)
		elapsed := ms(time.Since(start))
		if i >= 0 {
			samples = append(samples, elapsed)
			if profile {
				phase.RemainderMs = elapsed - phase.ParseMs - phase.GroupMs - phase.SortMs
				phases = append(phases, phase)
			}
		}
		output, err := json.Marshal(result)
		if err != nil {
			panic(err)
		}
		if expected != nil && !bytes.Equal(output, expected) {
			panic("iteration output mismatch")
		}
		expected = output
	}
	if err := os.WriteFile(os.Getenv("OUTPUT"), expected, 0600); err != nil {
		panic(err)
	}
	output, err := json.Marshal(map[string]any{"samples": samples, "phases": phases, "count": count, "warmup": warmup})
	if err != nil {
		panic(err)
	}
	fmt.Println(string(output))
}
