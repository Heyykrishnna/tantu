package qualification

import (
	"bytes"
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/minio/minlz"
)

func encode(t testing.TB, data []byte, sidecar bool, blockSize int) ([]byte, []byte) {
	t.Helper()
	var stream, side bytes.Buffer
	options := []minlz.WriterOption{minlz.WriterBlockSize(blockSize), minlz.WriterConcurrency(1), minlz.WriterSearchTable(minlz.NewSearchTableConfig().WithMatchLen(6))}
	if sidecar {
		options = append(options, minlz.WriterSidecar(&side))
	}
	writer := minlz.NewWriter(&stream, options...)
	if _, err := writer.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return stream.Bytes(), side.Bytes()
}

func oracle(data, pattern []byte) []int64 {
	offsets := []int64{}
	for start := 0; start <= len(data)-len(pattern); {
		position := bytes.Index(data[start:], pattern)
		if position < 0 {
			break
		}
		start += position
		offsets = append(offsets, int64(start))
		start++
	}
	return offsets
}

func corpus() []byte {
	data := bytes.Repeat([]byte("z"), 4096*6)
	copy(data[30:], []byte("NEEDLE_PATTERN alpha आकाश"))
	copy(data[4093:], []byte("BOUNDARY_NEEDLE"))
	copy(data[8190:], []byte("आकाश"))
	copy(data[12000:], []byte("abababa"))
	return data
}

func TestIndexedAndSidecarOracleParity(t *testing.T) {
	data := corpus()
	for _, sidecar := range []bool{false, true} {
		stream, side := encode(t, data, sidecar, 4096)
		decoded, err := DecodeBounded(stream, int64(len(data)))
		if err != nil || !bytes.Equal(decoded, data) {
			t.Fatalf("round trip mismatch: %v", err)
		}
		manifest := Manifest{"generation-1", Digest(stream), Digest(side)}
		if err := ValidatePair(stream, side, manifest); err != nil {
			t.Fatal(err)
		}
		for _, pattern := range []string{"NEEDLE_PATTERN", "BOUNDARY_NEEDLE", "आकाश", "a", "aba", "not-present", "alpha"} {
			result, err := Search(context.Background(), stream, side, []byte(pattern), 10000)
			if err != nil || result.State != "complete" || !reflect.DeepEqual(result.Offsets, oracle(data, []byte(pattern))) {
				t.Fatalf("oracle mismatch sidecar=%v pattern=%q: offsets=%v error=%v", sidecar, pattern, result.Offsets, err)
			}
		}
	}
}

func TestEmptyStreamAndMissingTablesFallback(t *testing.T) {
	stream, side := encode(t, nil, false, 4096)
	result, err := Search(context.Background(), stream, side, []byte("absent"), 10)
	if err != nil || result.State != "complete" || len(result.Offsets) != 0 {
		t.Fatalf("empty stream: %v", err)
	}
	var unindexed bytes.Buffer
	writer := minlz.NewWriter(&unindexed, minlz.WriterBlockSize(4096), minlz.WriterConcurrency(1))
	if _, err := writer.Write([]byte("fallback needle")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	result, err = Search(context.Background(), unindexed.Bytes(), nil, []byte("needle"), 10)
	if err != nil || !reflect.DeepEqual(result.Offsets, []int64{9}) {
		t.Fatalf("fallback mismatch: %v", err)
	}
}

func TestPairIntegrityAndMalformedInput(t *testing.T) {
	stream, side := encode(t, corpus(), true, 4096)
	manifest := Manifest{"generation-1", Digest(stream), Digest(side)}
	badStream := append([]byte(nil), stream...)
	badStream[len(badStream)/2] ^= 0xff
	if ValidatePair(badStream, side, manifest) == nil {
		t.Fatal("corrupt stream identity accepted")
	}
	_, otherSide := encode(t, bytes.Repeat([]byte("other-data"), 2000), true, 4096)
	if ValidatePair(stream, otherSide, manifest) == nil {
		t.Fatal("mismatched sidecar accepted")
	}
	if ValidatePair(stream, side, Manifest{}) == nil {
		t.Fatal("missing generation accepted")
	}
	for _, bad := range [][]byte{[]byte("not-a-minlz-stream"), stream[:4]} {
		result, err := Search(context.Background(), bad, nil, []byte("needle"), 10)
		if err == nil || result.State != "failed" {
			t.Fatal("malformed input reported as authoritative success")
		}
	}
}

func TestResourceLimitsCancellationAndCompleteness(t *testing.T) {
	stream, side := encode(t, []byte("needle needle needle"), false, 4096)
	result, err := Search(context.Background(), stream, side, []byte("needle"), 1)
	if !errors.Is(err, ErrResultLimit) || result.State != "partial" || len(result.Offsets) != 1 {
		t.Fatal("result limit must be partial")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, err = Search(ctx, stream, nil, []byte("needle"), 10)
	if !errors.Is(err, context.Canceled) || result.State != "partial" {
		t.Fatalf("cancelled search: %v", err)
	}
	for _, pattern := range [][]byte{nil, bytes.Repeat([]byte("a"), 1025)} {
		if _, err := Search(context.Background(), stream, nil, pattern, 10); !errors.Is(err, ErrInvalidRequest) {
			t.Fatal("invalid pattern accepted")
		}
	}
	if _, err := DecodeBounded(stream, 2); !errors.Is(err, ErrInvalidRequest) {
		t.Fatal("decoded byte limit ignored")
	}
	for _, limit := range []int64{-1, (4 << 20) + 1} {
		if _, err := DecodeBounded(stream, limit); !errors.Is(err, ErrInvalidRequest) {
			t.Fatal("invalid decoded-output bound accepted")
		}
	}
	if _, err := Search(context.Background(), make([]byte, (8<<20)+1), nil, []byte("needle"), 10); !errors.Is(err, ErrInvalidRequest) {
		t.Fatal("compressed-input bound ignored")
	}
	deadline, release := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer release()
	if result, err := Search(deadline, stream, nil, []byte("needle"), 10); !errors.Is(err, context.DeadlineExceeded) || result.State != "partial" {
		t.Fatal("expired deadline did not produce an honest incomplete result")
	}
	largeBlock, _ := encode(t, bytes.Repeat([]byte("z"), 16000), false, 8192)
	if _, err := Search(context.Background(), largeBlock, nil, []byte("z"), 10); err == nil {
		t.Fatal("maximum block limit ignored")
	}
}

func TestAuthorizationTombstonesAndCrossRecordMatches(t *testing.T) {
	records := []RecordSpan{{"visible", "alpha", 0, 20, false, true}, {"private", "alpha", 20, 40, false, false}, {"foreign", "beta", 40, 60, false, true}, {"deleted", "alpha", 60, 80, true, true}}
	if got := AuthorizedRecords([]int64{5, 25, 45, 65, 18}, 5, "alpha", records); !reflect.DeepEqual(got, []string{"visible"}) {
		t.Fatalf("authorization leak: %v", got)
	}
}

func FuzzOracleParity(f *testing.F) {
	f.Add([]byte("a needle and needle"), []byte("needle"))
	f.Add([]byte("abababa"), []byte("aba"))
	f.Fuzz(func(t *testing.T, data, pattern []byte) {
		if len(data) > 32768 || len(pattern) == 0 || len(pattern) > 32 {
			return
		}
		stream, side := encode(t, data, true, 4096)
		result, err := Search(context.Background(), stream, side, pattern, 10000)
		if errors.Is(err, ErrResultLimit) {
			expected := oracle(data, pattern)
			if result.State != "partial" || len(expected) <= 10000 || !reflect.DeepEqual(result.Offsets, expected[:10000]) {
				t.Fatal("limited search did not preserve exact authorized-prefix semantics")
			}
			return
		}
		if err != nil || !reflect.DeepEqual(result.Offsets, oracle(data, pattern)) {
			t.Fatalf("fuzz oracle mismatch: %v", err)
		}
	})
}

func BenchmarkIndexedSearch(b *testing.B) {
	data := bytes.Repeat([]byte("structured synthetic archive record zzz\n"), 30000)
	copy(data[len(data)/2:], []byte("UNIQUE_NEEDLE_PATTERN"))
	stream, side := encode(b, data, false, 4096)
	b.ReportAllocs()
	b.SetBytes(int64(len(data)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result, err := Search(context.Background(), stream, side, []byte("UNIQUE_NEEDLE_PATTERN"), 10)
		if err != nil || len(result.Offsets) != 1 {
			b.Fatalf("benchmark mismatch: %v", err)
		}
	}
	b.ReportMetric(float64(len(stream))/float64(len(data)), "compressed/input")
}
