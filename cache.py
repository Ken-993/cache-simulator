from collections import deque, defaultdict


class Node:
    """Node of a doubly linked list."""
    __slots__ = ("key", "freq", "prev", "next")

    def __init__(self, key=None):
        self.key = key
        self.freq = 1
        self.prev = None
        self.next = None


class DoublyLinkedList:
    """DLL with sentinel head/tail nodes. All operations are O(1)."""

    def __init__(self):
        self.head = Node()
        self.tail = Node()
        self.head.next = self.tail
        self.tail.prev = self.head
        self.size = 0

    def add_front(self, node):
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node
        self.size += 1

    def remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev
        node.prev = node.next = None
        self.size -= 1

    def pop_back(self):
        if self.size == 0:
            return None
        node = self.tail.prev
        self.remove(node)
        return node

    def keys(self):
        cur, out = self.head.next, []
        while cur is not self.tail:
            out.append(cur.key)
            cur = cur.next
        return out


class Cache:
    """Base class: tracks hits/misses. Subclasses implement access()."""
    name = "Base"

    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("Capacity must be positive")
        self.capacity = capacity
        self.hits = 0
        self.misses = 0
        self.last_evicted = None

    def access(self, key):
        raise NotImplementedError

    def contents(self):
        raise NotImplementedError

    @property
    def hit_ratio(self):
        total = self.hits + self.misses
        return self.hits / total if total else 0.0


class LRUCache(Cache):
    """Least Recently Used: hash map + DLL -> O(1) access and eviction.
    Front of list = most recently used, back = least recently used."""
    name = "LRU"

    def __init__(self, capacity):
        super().__init__(capacity)
        self.map = {}
        self.list = DoublyLinkedList()

    def access(self, key):
        self.last_evicted = None
        if key in self.map:                      # HIT: move to front
            node = self.map[key]
            self.list.remove(node)
            self.list.add_front(node)
            self.hits += 1
            return True

        self.misses += 1                         # MISS
        if len(self.map) == self.capacity:       # evict LRU (back)
            lru = self.list.pop_back()
            del self.map[lru.key]
            self.last_evicted = lru.key
        node = Node(key)
        self.list.add_front(node)
        self.map[key] = node
        return False

    def contents(self):
        return self.list.keys()  # MRU -> LRU


class FIFOCache(Cache):
    """First In First Out: evicts the oldest inserted item. O(1)."""
    name = "FIFO"

    def __init__(self, capacity):
        super().__init__(capacity)
        self.queue = deque()
        self.items = set()

    def access(self, key):
        self.last_evicted = None
        if key in self.items:
            self.hits += 1
            return True
        self.misses += 1
        if len(self.items) == self.capacity:
            old = self.queue.popleft()
            self.items.remove(old)
            self.last_evicted = old
        self.queue.append(key)
        self.items.add(key)
        return False

    def contents(self):
        return list(reversed(self.queue))  # newest -> oldest


class LFUCache(Cache):
    """Least Frequently Used, O(1) version.
    freq -> DLL of nodes with that freq; ties broken by LRU."""
    name = "LFU"

    def __init__(self, capacity):
        super().__init__(capacity)
        self.map = {}
        self.freq_lists = defaultdict(DoublyLinkedList)
        self.min_freq = 0

    def _touch(self, node):
        f = node.freq
        self.freq_lists[f].remove(node)
        if f == self.min_freq and self.freq_lists[f].size == 0:
            self.min_freq += 1
        node.freq += 1
        self.freq_lists[node.freq].add_front(node)

    def access(self, key):
        self.last_evicted = None
        if key in self.map:
            self._touch(self.map[key])
            self.hits += 1
            return True

        self.misses += 1
        if len(self.map) == self.capacity:
            victim = self.freq_lists[self.min_freq].pop_back()
            del self.map[victim.key]
            self.last_evicted = victim.key
        node = Node(key)
        self.map[key] = node
        self.freq_lists[1].add_front(node)
        self.min_freq = 1
        return False

    def contents(self):
        return [f"{k}(f={n.freq})" for k, n in self.map.items()]


class OptimalCache(Cache):
    """Belady's Optimal: evicts the item used farthest in the future.
    Impossible in real life (needs future knowledge) -> used as the
    theoretical upper bound to compare other policies against."""
    name = "Optimal"

    def __init__(self, capacity, sequence):
        super().__init__(capacity)
        self.pos = 0
        self.next_use = self._precompute(sequence)
        self.cache = {}  # key -> index of its next use

    @staticmethod
    def _precompute(seq):
        nxt, last_seen = [float("inf")] * len(seq), {}
        for i in range(len(seq) - 1, -1, -1):
            nxt[i] = last_seen.get(seq[i], float("inf"))
            last_seen[seq[i]] = i
        return nxt

    def access(self, key):
        self.last_evicted = None
        i = self.pos
        self.pos += 1
        if key in self.cache:
            self.cache[key] = self.next_use[i]
            self.hits += 1
            return True
        self.misses += 1
        if len(self.cache) == self.capacity:
            victim = max(self.cache, key=self.cache.get)
            del self.cache[victim]
            self.last_evicted = victim
        self.cache[key] = self.next_use[i]
        return False

    def contents(self):
        return list(self.cache.keys())