#!/usr/bin/env python3
"""Run Discovery Mode for a list of topic pairs against a running LIBRAIN API, one at a
time, saving each response and its exact Anthropic cost (computed from the token counts the
API logs). Stops before a run whose estimated cost would push the total past the budget.

This is how Experiment 8 was produced (experiments/featured-discoveries/ and
experiments/new-areas-discoveries/). Every run is a PAID call to the model APIs.

  dotnet run --project LIBRAIN --urls http://localhost:5099 > api.log 2>&1 &
  python3 scripts/run_discoveries.py --pairs experiments/new-areas-discoveries/pairs.json \
      --out runs/ --log api.log --budget 2.00
"""
import argparse, json, os, re, time, urllib.error, urllib.request

SONNET, HAIKU = (3.00, 15.00), (1.00, 5.00)  # US$ per 1M tokens (input, output)
USAGE = re.compile(r"input=(\d+) output=(\d+) cacheRead=(\d+) cacheCreate=(\d+)")


def cost_of(log_chunk: str) -> float:
    total = 0.0
    for line in log_chunk.splitlines():
        m = USAGE.search(line)
        if not m:
            continue
        i, o, cr, cw = map(int, m.groups())
        p = SONNET if "Discovery synthesis" in line else HAIKU
        total += (i * p[0] + o * p[1] + cr * p[0] * 0.1 + cw * p[0] * 1.25) / 1e6  # cache read 0.1x, write 1.25x
    return total


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True, help="the API's stdout log (token counts are parsed from it)")
    ap.add_argument("--budget", type=float, required=True, help="US$ cap for this batch")
    ap.add_argument("--api", default="http://localhost:5099/api/discover")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ledger_path = os.path.join(a.out, "ledger.json")
    ledger = json.load(open(ledger_path)) if os.path.exists(ledger_path) else {"total": 0.0, "runs": {}}
    estimate = max((r["cost"] for r in ledger["runs"].values()), default=0.08)
    for pair in json.load(open(a.pairs)):
        pid = pair["id"]
        if pid in ledger["runs"]:
            continue
        if ledger["total"] + estimate * 1.3 > a.budget:
            print(f"STOP before {pid}: ${ledger['total']:.3f} spent, next run ~${estimate:.3f}, budget ${a.budget}")
            break
        start = os.path.getsize(a.log)
        body = json.dumps({"topicA": pair["topicA"], "topicB": pair["topicB"], "topK": pair.get("topK", 5)}).encode()
        req = urllib.request.Request(a.api, data=body, headers={"content-type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=400) as res:
                resp, status = json.load(res), res.status
        except urllib.error.HTTPError as e:
            resp, status = json.loads(e.read() or b"{}"), e.code
        time.sleep(1.0)
        with open(a.log, "rb") as f:
            f.seek(start)
            cost = cost_of(f.read().decode("utf-8", "replace"))
        ledger["total"] += cost
        ledger["runs"][pid] = {"cost": round(cost, 5), "status": status, "seconds": round(time.time() - t0, 1)}
        estimate = max(estimate, cost)
        record = {"id": pid, "request": {k: pair[k] for k in ("topicA", "topicB")} | {"topK": pair.get("topK", 5)},
                  "status": status, "costUsd": round(cost, 5), "response": resp}
        json.dump(record, open(os.path.join(a.out, f"{pid}.json"), "w"), indent=2, ensure_ascii=False)
        json.dump(ledger, open(ledger_path, "w"), indent=2)
        print(f"{pid} [{status}] ${cost:.4f} (total ${ledger['total']:.3f})", flush=True)


if __name__ == "__main__":
    main()
