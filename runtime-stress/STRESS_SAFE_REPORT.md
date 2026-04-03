# Stress Safe Report

Base URL: http://127.0.0.1:3300
Generated at: 2026-03-14T09:33:01.360Z
Timeout: 9000ms
Concurrency: 6

## Scan
- total: 120
- failed: 31
- failure rate: 0.2583
- latency avg/p50/p95/max: 3266/3059/6447/9002 ms

Top failures:
- missing_expected:PIDNEXT: 29
- http_timeout: 2

## Conversation
- total: 40
- failed: 40
- failure rate: 1
- latency avg/p50/p95/max: 1570/1587/1967/2196 ms
- stupid questions: 0/0 (0)

Top failures:
- http_200: 90
- readiness_reason_unexpected:none: 40
- business_exists_mismatch: 10
- region_mismatch: 10
- sector_mismatch: 10
- next_field_unexpected:none: 10
