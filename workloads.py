import random


def uniform(n, num_keys, seed=42):
    """Every key equally likely, so caching helps little."""
    rng = random.Random(seed)
    return [rng.randint(1, num_keys) for _ in range(n)]


def zipf(n, num_keys, s=1.1, seed=42):
    """A few keys are very popular (like real web pages / videos)."""
    rng = random.Random(seed)
    keys = list(range(1, num_keys + 1))
    weights = [1 / (k ** s) for k in keys]
    return rng.choices(keys, weights=weights, k=n)


def looping(n, loop_size):
    """Sequential scan in a loop: LRU's worst case
    when loop_size > capacity."""
    return [(i % loop_size) + 1 for i in range(n)]


def locality(n, num_keys, working_set=10, shift_every=200, seed=42):
    """Program accesses a small 'working set' that shifts over time
    (like real memory/page access)."""
    rng = random.Random(seed)
    seq, base = [], 1
    for i in range(n):
        if i and i % shift_every == 0:
            base = rng.randint(1, max(1, num_keys - working_set))
        seq.append(base + rng.randint(0, working_set - 1))
    return seq


WORKLOADS = {
    "Uniform Random": lambda n: uniform(n, 100),
    "Zipf (Popular Items)": lambda n: zipf(n, 100),
    "Looping Scan": lambda n: looping(n, 25),
    "Temporal Locality": lambda n: locality(n, 100),
}