import os
from flask import Flask, jsonify, render_template, request

from cache import LRUCache, FIFOCache, LFUCache, OptimalCache
from workloads import WORKLOADS

app = Flask(__name__)

MAX_CAPACITY = 50
MAX_SEQUENCE = 200
COMPARE_CAPACITIES = [5, 10, 20, 30, 50, 75]
COMPARE_ACCESSES = 5000


def make_caches(capacity, sequence):
    return [
        LRUCache(capacity),
        FIFOCache(capacity),
        LFUCache(capacity),
        OptimalCache(capacity, sequence),
    ]


@app.route("/")
def index():
    return render_template("index.html", workloads=list(WORKLOADS.keys()))


@app.route("/health")
def health():
    return {"status": "ok"}


@app.post("/api/simulate")
def simulate():
    data = request.get_json(silent=True) or {}

    try:
        capacity = int(data.get("capacity", 3))
    except (TypeError, ValueError):
        return jsonify(error="Capacity must be a number."), 400

    sequence = str(data.get("sequence", "")).replace(",", " ").split()

    if not 1 <= capacity <= MAX_CAPACITY:
        return jsonify(error=f"Capacity must be between 1 and {MAX_CAPACITY}."), 400
    if not sequence:
        return jsonify(error="Enter at least one key in the sequence."), 400
    if len(sequence) > MAX_SEQUENCE:
        return jsonify(error=f"Sequence can have at most {MAX_SEQUENCE} keys."), 400

    caches = make_caches(capacity, sequence)
    steps = []
    for key in sequence:
        step = {"key": key, "policies": {}}
        for c in caches:
            hit = c.access(key)
            step["policies"][c.name] = {
                "hit": hit,
                "evicted": c.last_evicted,
                "contents": c.contents(),
            }
        steps.append(step)

    summary = {
        c.name: {
            "hits": c.hits,
            "misses": c.misses,
            "ratio": round(c.hit_ratio * 100, 2),
        }
        for c in caches
    }
    return jsonify(capacity=capacity, steps=steps, summary=summary)


@app.post("/api/compare")
def compare():
    data = request.get_json(silent=True) or {}
    workload = data.get("workload")
    if workload not in WORKLOADS:
        return jsonify(error="Unknown workload."), 400

    sequence = WORKLOADS[workload](COMPARE_ACCESSES)
    results = {}
    for cap in COMPARE_CAPACITIES:
        for c in make_caches(cap, sequence):
            for key in sequence:
                c.access(key)
            results.setdefault(c.name, []).append(round(c.hit_ratio * 100, 2))

    return jsonify(capacities=COMPARE_CAPACITIES, results=results)


if __name__ == "__main__":
    # Local development only. In Docker/Render, gunicorn runs the app.
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)