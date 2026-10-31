// Demo/benchmark server only. CGO_ENABLED=0; no adapter/product integration.
package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const passwordHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyehtJ/whDdsI.d1w/JqKiOrDw8pCT0JLG"

var instance = strconv.FormatInt(time.Now().UnixNano(), 10)

type total struct {
	Key     int   `json:"key"`
	Orders  int   `json:"orders"`
	Revenue int64 `json:"revenueCents"`
}

func add(t map[int]*total, key int, revenue int64) {
	v := t[key]
	if v == nil {
		v = &total{Key: key}
		t[key] = v
	}
	v.Orders++
	v.Revenue += revenue
}
func sorted(t map[int]*total) []*total {
	a := make([]*total, 0, len(t))
	for _, v := range t {
		a = append(a, v)
	}
	sort.Slice(a, func(i, j int) bool {
		if a[i].Revenue != a[j].Revenue {
			return a[i].Revenue > a[j].Revenue
		}
		return a[i].Key < a[j].Key
	})
	return a
}
func writeJSON(w http.ResponseWriter, value any) {
	b, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}
func invalid(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(400)
	w.Write([]byte(`{"error":"invalid input"}`))
}
func body(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	return io.ReadAll(http.MaxBytesReader(w, r.Body, 16*1024*1024))
}
func integer(s string, min, max int) (int, error) {
	if s == "" {
		return 0, errors.New("empty integer")
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid integer")
		}
	}
	n, e := strconv.Atoi(s)
	if e != nil || n < min || n > max {
		return 0, errors.New("integer range")
	}
	return n, nil
}
func csvReport(w http.ResponseWriter, r *http.Request) {
	b, e := body(w, r)
	if e != nil {
		invalid(w)
		return
	}
	rows, e := csv.NewReader(bytes.NewReader(b)).ReadAll()
	if e != nil || len(rows) == 0 || strings.Join(rows[0], ",") != "id,region,sku,amountCents,quantity,status,note" {
		invalid(w)
		return
	}
	totals := map[int]*total{}
	accepted := 0
	for _, row := range rows[1:] {
		if len(row) != 7 {
			invalid(w)
			return
		}
		_, e0 := integer(row[0], 0, 1000000)
		region, e1 := integer(row[1], 0, 7)
		sku, e2 := integer(row[2], 0, 127)
		amount, e3 := integer(row[3], 0, 1000000)
		qty, e4 := integer(row[4], 1, 100)
		if e0 != nil || e1 != nil || e2 != nil || e3 != nil || e4 != nil || (row[5] != "paid" && row[5] != "refund") {
			invalid(w)
			return
		}
		if row[5] == "paid" {
			add(totals, region*128+sku, int64(amount)*int64(qty))
			accepted++
		}
	}
	writeJSON(w, struct {
		Rows     int      `json:"rows"`
		Accepted int      `json:"accepted"`
		Groups   []*total `json:"groups"`
	}{len(rows) - 1, accepted, sorted(totals)})
}

// Pointer fields preserve missing/null validation without a generic JSON DOM.
type customer struct {
	ID       *float64 `json:"id"`
	Region   *float64 `json:"region"`
	Discount *float64 `json:"discountBps"`
}
type order struct {
	ID       *float64 `json:"id"`
	Customer *float64 `json:"customerId"`
	Amount   *float64 `json:"amountCents"`
	Qty      *float64 `json:"quantity"`
	Status   string   `json:"status"`
	Note     *string  `json:"note"`
}
type export struct {
	Customers []customer `json:"customers"`
	Orders    []order    `json:"orders"`
}
type item struct {
	ID       int   `json:"id"`
	Customer int   `json:"customerId"`
	Region   int   `json:"region"`
	Net      int64 `json:"netCents"`
}

func bounded(n *float64, min, max float64) bool {
	return n != nil && !math.IsNaN(*n) && *n >= min && *n <= max && math.Trunc(*n) == *n
}
func jsonReport(w http.ResponseWriter, r *http.Request) {
	b, e := body(w, r)
	if e != nil {
		invalid(w)
		return
	}
	var input export
	if json.Unmarshal(b, &input) != nil || input.Customers == nil || input.Orders == nil {
		invalid(w)
		return
	}
	customers := make(map[int]customer, len(input.Customers))
	for _, c := range input.Customers {
		if !bounded(c.ID, 0, 1000000) || !bounded(c.Region, 0, 7) || !bounded(c.Discount, 0, 5000) {
			invalid(w)
			return
		}
		id := int(*c.ID)
		if _, ok := customers[id]; ok {
			invalid(w)
			return
		}
		customers[id] = c
	}
	totals := map[int]*total{}
	items := make([]item, 0, len(input.Orders))
	for _, o := range input.Orders {
		if !bounded(o.ID, 0, 1000000) || !bounded(o.Customer, 0, 1000000) || !bounded(o.Amount, 0, 1000000) || !bounded(o.Qty, 1, 100) || o.Note == nil || (o.Status != "paid" && o.Status != "refund") {
			invalid(w)
			return
		}
		c, ok := customers[int(*o.Customer)]
		if !ok {
			invalid(w)
			return
		}
		if o.Status == "paid" {
			net := int64(*o.Amount) * int64(*o.Qty) * (10000 - int64(*c.Discount)) / 10000
			items = append(items, item{int(*o.ID), int(*o.Customer), int(*c.Region), net})
			add(totals, int(*c.Region), net)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Net != items[j].Net {
			return items[i].Net > items[j].Net
		}
		return items[i].ID < items[j].ID
	})
	writeJSON(w, struct {
		Rows     int      `json:"rows"`
		Accepted int      `json:"accepted"`
		Groups   []*total `json:"groups"`
		Items    []item   `json:"items"`
	}{len(input.Orders), len(items), sorted(totals), items})
}
func thumbnail(w http.ResponseWriter, r *http.Request) {
	width, e1 := integer(r.URL.Query().Get("width"), 4, 1024)
	height, e2 := integer(r.URL.Query().Get("height"), 4, 1024)
	if e1 != nil || e2 != nil || width%4 != 0 || height%4 != 0 {
		invalid(w)
		return
	}
	rgba, e := body(w, r)
	if e != nil || len(rgba) != width*height*4 {
		invalid(w)
		return
	}
	tw, th := width/4, height/4
	out := make([]byte, tw*th*4)
	for y := 0; y < th; y++ {
		for x := 0; x < tw; x++ {
			for c := 0; c < 4; c++ {
				sum := 0
				for dy := 0; dy < 4; dy++ {
					for dx := 0; dx < 4; dx++ {
						sum += int(rgba[((y*4+dy)*width+x*4+dx)*4+c])
					}
				}
				out[(y*tw+x)*4+c] = byte(sum / 16)
			}
		}
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(out)
}
func password(w http.ResponseWriter, r *http.Request) {
	b, e := body(w, r)
	var input struct {
		Password string `json:"password"`
	}
	if e != nil || json.Unmarshal(b, &input) != nil || len(input.Password) == 0 || len(input.Password) > 72 {
		invalid(w)
		return
	}
	valid := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) == nil
	writeJSON(w, struct {
		Valid bool `json:"valid"`
		Cost  int  `json:"cost"`
	}{valid, 10})
}
func file(name string) string {
	b, e := os.ReadFile(name)
	if e != nil {
		return "unavailable"
	}
	return string(b)
}
func diagnostics(w http.ResponseWriter, r *http.Request) {
	var usage syscall.Rusage
	syscall.Getrusage(syscall.RUSAGE_SELF, &usage)
	status := file("/proc/self/status")
	rss := int64(0)
	for _, line := range strings.Split(status, "\n") {
		if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			n, _ := strconv.ParseInt(fields[1], 10, 64)
			rss = n * 1024
		}
	}
	stat := file("/proc/self/stat")
	fields := strings.Fields(stat[strings.LastIndex(stat, ")")+2:])
	var user, system int64
	if len(fields) > 12 {
		user, _ = strconv.ParseInt(fields[11], 10, 64)
		system, _ = strconv.ParseInt(fields[12], 10, 64)
	}
	writeJSON(w, map[string]any{"instance": instance, "pid": os.Getpid(), "cpu": map[string]int64{"user": usage.Utime.Sec*1000000 + int64(usage.Utime.Usec), "system": usage.Stime.Sec*1000000 + int64(usage.Stime.Usec)}, "rss": rss, "procCpuTicks": map[string]int64{"user": user, "system": system}, "availableParallelism": runtime.NumCPU(), "status": status, "cpuMax": file("/sys/fs/cgroup/cpu.max"), "cgroup": file("/proc/self/cgroup"), "cpuQuota": file("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"), "cpuPeriod": file("/sys/fs/cgroup/cpu/cpu.cfs_period_us")})
}
func handler() http.Handler {
	mux := http.NewServeMux()
	for name, fn := range map[string]http.HandlerFunc{"csv": csvReport, "json": jsonReport, "thumbnail": thumbnail, "bcrypt": password} {
		mux.HandleFunc("POST /api/heavy/"+name, fn)
		mux.HandleFunc("POST /api/heavy-go/"+name, fn)
	}
	mux.HandleFunc("GET /api/heavy/diagnostics", diagnostics)
	mux.HandleFunc("GET /api/heavy-go/diagnostics", diagnostics)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3101"
	}
	fmt.Printf("heavy Go pid=%d port=%s\n", os.Getpid(), port)
	log.Fatal(http.ListenAndServe(":"+port, handler()))
}
