package qualification

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"sync/atomic"

	"github.com/minio/minlz"
)

var ErrResultLimit = errors.New("archive result limit reached")
var ErrInvalidRequest = errors.New("invalid or unbounded archive request")

type Manifest struct {
	Generation  string
	StreamHash  string
	SidecarHash string
}

type Result struct {
	State            string
	Offsets          []int64
	Stats            minlz.SearchStats
	MainReadCalls    int64
	MainBytesRead    int64
	SidecarBytesRead int64
}

type RecordSpan struct {
	ID       string
	Tenant   string
	Start    int64
	End      int64
	Deleted  bool
	Readable bool
}

func Digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func ValidatePair(stream, sidecar []byte, manifest Manifest) error {
	if manifest.Generation == "" || Digest(stream) != manifest.StreamHash || Digest(sidecar) != manifest.SidecarHash {
		return errors.New("archive generation or stream/sidecar identity mismatch")
	}
	return nil
}

type guardedReader struct {
	ctx    context.Context
	reader *bytes.Reader
	calls  *atomic.Int64
	bytes  *atomic.Int64
}

func (reader guardedReader) Read(data []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := reader.reader.Read(data)
	reader.calls.Add(1)
	reader.bytes.Add(int64(n))
	return n, err
}

func (reader guardedReader) ReadAt(data []byte, offset int64) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := reader.reader.ReadAt(data, offset)
	reader.calls.Add(1)
	reader.bytes.Add(int64(n))
	return n, err
}

func Search(ctx context.Context, stream, sidecar, pattern []byte, limit int) (Result, error) {
	if len(pattern) == 0 || len(pattern) > 1024 || len(stream) > 8<<20 || len(sidecar) > 8<<20 || limit < 1 || limit > 10000 {
		return Result{State: "failed"}, ErrInvalidRequest
	}
	result := Result{State: "complete", Offsets: []int64{}}
	callback := func(match minlz.SearchResult) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if len(result.Offsets) == limit {
			return ErrResultLimit
		}
		result.Offsets = append(result.Offsets, match.StreamOffset)
		return nil
	}
	var err error
	var mainCalls, mainBytes, sideCalls, sideBytes atomic.Int64
	mainReader := guardedReader{ctx: ctx, reader: bytes.NewReader(stream), calls: &mainCalls, bytes: &mainBytes}
	if len(sidecar) == 0 {
		searcher := minlz.NewBlockSearcher(mainReader, minlz.BlockSearchCollectStats(), minlz.BlockSearchMaxBlockSize(4096))
		err = searcher.Search(pattern, callback)
		result.Stats = searcher.Stats()
	} else {
		sideReader := guardedReader{ctx: ctx, reader: bytes.NewReader(sidecar), calls: &sideCalls, bytes: &sideBytes}
		searcher := minlz.NewSidecarSearcher(mainReader, sideReader, minlz.BlockSearchCollectStats(), minlz.BlockSearchMaxBlockSize(4096))
		err = searcher.Search(pattern, callback)
		result.Stats = searcher.Stats()
	}
	if err != nil {
		if errors.Is(err, ErrResultLimit) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			result.State = "partial"
		} else {
			result = Result{State: "failed"}
		}
	}
	result.MainReadCalls = mainCalls.Load()
	result.MainBytesRead = mainBytes.Load()
	result.SidecarBytesRead = sideBytes.Load()
	return result, err
}

func AuthorizedRecords(offsets []int64, patternLength int, tenant string, records []RecordSpan) []string {
	visible := []string{}
	for _, offset := range offsets {
		for _, record := range records {
			if record.Tenant == tenant && record.Readable && !record.Deleted && offset >= record.Start && offset+int64(patternLength) <= record.End {
				visible = append(visible, record.ID)
			}
		}
	}
	return visible
}

func DecodeBounded(stream []byte, limit int64) ([]byte, error) {
	if limit < 0 || limit > 4<<20 || len(stream) > 8<<20 {
		return nil, ErrInvalidRequest
	}
	decoded, err := io.ReadAll(io.LimitReader(minlz.NewReader(bytes.NewReader(stream), minlz.ReaderMaxBlockSize(8192)), limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(decoded)) > limit {
		return nil, ErrInvalidRequest
	}
	return decoded, nil
}
