# Cache Replacement Simulator

An interactive web app that visualises and compares four classic cache replacement policies (**LRU, FIFO, LFU and Bélády's Optimal**), built for the Advanced Data Structures and Algorithms (ADSA) course at Chandigarh University.

**Live demo:** https://cache-simulator-mshr.onrender.com

> The site runs on Render's free tier, so it sleeps when idle. The first visit after a break can take about a minute to load.

---

## What it does

When a cache is full and a new item arrives, something has to be thrown out. The rule that decides what goes is a **replacement policy**. This project lets you watch four policies make that decision side by side, request by request, and compare how well each one performs on different kinds of data.

| Policy | Evicts | Idea |
| --- | --- | --- |
| **LRU** | The key unused for the longest time | Recently used data will probably be used again |
| **FIFO** | The key that arrived first | Simple queue order |
| **LFU** | The key used the fewest times | Popular data stays popular |
| **Optimal** | The key needed furthest in the future | Theoretical best; used as a benchmark |

## Features

### Simulate
- Enter any cache size (1–50) and access sequence (up to 200 keys), or pick a ready-made scenario.
- Watch keys drop into slots, hits flash, and evicted keys fall out.
- Read a plain-language reason for every decision, such as *"Evicted 3, not needed until request 10."*
- Follow a logic-analyser-style **hit and miss trace** for all four policies, and click any column to jump there.
- Control playback with Play/Pause, step buttons, a speed slider, or the keyboard (`Space`, `←`, `→`, `Home`, `End`).
- See a live ranking and a final score.

### Compare
- Replays **5,000 requests** at cache sizes 5, 10, 20, 30, 50 and 75 across four workloads:
  - **Uniform random:** every key equally likely
  - **Zipf:** a few keys get most requests, like trending content
  - **Looping scan:** cycles through 25 keys, the classic worst case for LRU
  - **Temporal locality:** a small working set that shifts over time
- Interactive hit-ratio chart with auto-generated insights.

### How LRU works
- An interactive lab: access keys one at a time and watch the **hash map** and **doubly linked list** update live, with a log of each operation.

## Data structures

The core of the project is implemented from scratch in `cache.py`.

| Policy | Data structures | Time per access |
| --- | --- | --- |
| LRU | Hash map + doubly linked list with sentinel nodes | O(1) |
| FIFO | `deque` + `set` | O(1) |
| LFU | Hash map + map of frequency → doubly linked list, with a `min_freq` pointer | O(1) |
| Optimal | Next-use array precomputed in one backward pass | O(capacity) per eviction |

**Why a hash map *and* a linked list for LRU?** The hash map finds any key in O(1) but has no order. The doubly linked list keeps keys in order of use and can move or remove any node in O(1), but can't find a key quickly. Together they give O(1) for every operation.

```
Hash map:   { 3 -> node3,  2 -> node2,  1 -> node1 }
                  |            |            |
List:   head <-> [3] <-----> [2] <-----> [1] <-> tail
               most recent              least recent (evicted next)
```

## Try this: Bélády's anomaly

Run the sequence `1 2 3 4 1 2 5 1 2 3 4 5` (it's in the scenario list):

| Policy | Misses with 3 slots | Misses with 4 slots |
| --- | --- | --- |
| LRU | 10 | 8 |
| FIFO | **9** | **10** |
| LFU | 10 | 8 |
| Optimal | 7 | 6 |

FIFO gets *more* misses with a *bigger* cache. LRU and Optimal can never do this, because they are "stack algorithms".

## Tech stack

- **Backend:** Python 3.12, Flask, Gunicorn
- **Frontend:** HTML, CSS and JavaScript (no build step), Chart.js
- **Deployment:** Docker, Render

## Project structure

```
cache-simulator/
├── app.py               # Flask app: page, /health, /api/simulate, /api/compare
├── cache.py             # Node, DoublyLinkedList, LRU, FIFO, LFU, Optimal
├── workloads.py         # Uniform, Zipf, looping and locality generators
├── requirements.txt     # flask, gunicorn
├── Dockerfile           # Container build recipe
├── templates/
│   └── index.html       # Page structure
└── static/
    ├── style.css        # Navy and beige theme, layout, animations
    └── script.js        # Rendering, playback, chart, LRU lab
```

## Run locally

**With Python:**

```bash
git clone https://github.com/<your-username>/cache-simulator.git
cd cache-simulator
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

**With Docker:**

```bash
docker build -t cache-sim .
docker run --rm -p 10000:10000 cache-sim
```

Open http://localhost:10000

## Deploy on Render

1. Push the repository to GitHub.
2. On [Render](https://render.com), choose **New → Web Service** and connect the repository.
3. Set **Language** to **Docker**, choose the **Free** instance type, and set the health check path to `/health`.
4. Click **Create Web Service**.

Render injects a `PORT` environment variable, and the Dockerfile binds Gunicorn to it automatically. Every `git push` triggers a new deploy.

## API

| Endpoint | Body | Returns |
| --- | --- | --- |
| `GET /health` | — | `{"status": "ok"}` |
| `POST /api/simulate` | `{"capacity": 3, "sequence": "1 2 3 4"}` | Every step (hit, evicted key, contents) for each policy, plus a summary |
| `POST /api/compare` | `{"workload": "Looping Scan"}` | Hit ratio per policy at each cache size |

Invalid input returns HTTP 400 with a message, for example `{"error": "Capacity must be between 1 and 50."}`.

## Author

**Aayush Sangra** (26MAI10086)
ME CSE (AI/ML), Chandigarh University
Course: Advanced Data Structures and Algorithms
Supervisor: Prof. Kushalpreet Kaur

## References

- L. A. Bélády, "A study of replacement algorithms for a virtual-storage computer," *IBM Systems Journal*, 1966.
- L. A. Bélády, R. A. Nelson and G. S. Shedler, "An anomaly in space-time characteristics of certain programs running in a paging machine," *Communications of the ACM*, 1969.
- K. Shah, A. Mitra and D. Matani, "An O(1) algorithm for implementing the LFU cache eviction scheme," 2010.
