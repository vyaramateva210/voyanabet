"""
Monte Carlo simulation engine for Voyanabet — Slots and Blackjack.
Runs 1,000,000 iterations per game using multiprocessing.Pool.

Usage:
    python server/simulate.py              # default seed
    python server/simulate.py --seed 42    # reproducible run
"""

import argparse
import math
import random
import statistics
import time
from multiprocessing import Pool, cpu_count

# ─── Config ───────────────────────────────────────────────────────────────────

ITERATIONS   = 1_000_000
CHUNK_SIZE   = 100_000
N_CHUNKS     = ITERATIONS // CHUNK_SIZE
DEFAULT_BET  = 10
NUM_DECKS    = 6

# ─── Slots constants (mirrors src/slots.js exactly) ──────────────────────────

SYMBOL_WEIGHTS = {
    'Cherry':  30,
    'Bar':     20,
    'Bell':    15,
    'Seven':   10,
    'Diamond':  5,
    'Jackpot':  1,
}

PAYTABLE = {
    '3X': {'Jackpot': 100, 'Diamond': 25, 'Seven': 20, 'Bell': 10, 'Bar': 5, 'Cherry': 3},
    '2X': {'Jackpot':  15, 'Diamond':  5, 'Seven':  3, 'Bell':  2, 'Bar': 1, 'Cherry': 1},
}

SYMBOLS_LIST    = list(SYMBOL_WEIGHTS.keys())
WEIGHTS_LIST    = [SYMBOL_WEIGHTS[s] for s in SYMBOLS_LIST]
LOSS_THRESHOLD  = DEFAULT_BET * 3  # circuit breaker: 3× starting bet

# ─── Blackjack constants ──────────────────────────────────────────────────────

RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
SUITS = ['S','H','D','C']

# ─── Slots simulation ─────────────────────────────────────────────────────────

def slots_spin(rng, bet=DEFAULT_BET):
    """Spins 3 reels and returns (payout, outcome_key)."""
    reels = rng.choices(SYMBOLS_LIST, weights=WEIGHTS_LIST, k=3)
    a, b, c = reels

    if a == b == c:
        key = f'{a}_3X'
        mult = PAYTABLE['3X'].get(a, 0)
        return bet * mult, key

    counts = {}
    for s in reels:
        counts[s] = counts.get(s, 0) + 1

    pairs = [s for s, n in counts.items() if n >= 2]
    if pairs:
        # Highest-value pair = lowest weight (rarest)
        best = min(pairs, key=lambda s: SYMBOL_WEIGHTS[s])
        key = f'{best}_2X'
        mult = PAYTABLE['2X'].get(best, 0)
        return bet * mult, key

    return 0, 'LOSS'


def _slots_chunk(args):
    chunk_id, n, seed_val = args
    rng = random.Random(seed_val)
    results = []
    for _ in range(n):
        payout, outcome = slots_spin(rng)
        results.append((DEFAULT_BET, payout, outcome))
    return results


# ─── Blackjack simulation ─────────────────────────────────────────────────────

def rank_value(rank):
    if rank in ('J', 'Q', 'K'):
        return 10
    if rank == 'A':
        return 11
    return int(rank)


def hand_value(hand):
    total = sum(rank_value(r) for r in hand)
    aces  = hand.count('A')
    while total > 21 and aces:
        total -= 10
        aces  -= 1
    return total, aces > 0   # (value, is_soft)


def build_shoe(rng):
    shoe = RANKS * 4 * NUM_DECKS  # 6 decks × 52 cards = 312 cards
    rng.shuffle(shoe)
    return shoe


def basic_strategy_action(player_hand, dealer_upcard):
    """Returns 'HIT' or 'STAND' per simplified basic strategy."""
    total, soft = hand_value(player_hand)
    dealer_val  = rank_value(dealer_upcard)

    if soft:
        return 'STAND' if total >= 18 else 'HIT'

    if total >= 17:
        return 'STAND'
    if total >= 13:
        return 'STAND' if dealer_val <= 6 else 'HIT'
    if total == 12:
        return 'STAND' if 4 <= dealer_val <= 6 else 'HIT'
    return 'HIT'


def blackjack_round(rng, shoe, bet=DEFAULT_BET):
    """
    Plays one round of Blackjack using basic strategy.
    Reshuffles shoe when < 60 cards remain.
    Returns (bet, payout, outcome, shoe).
    """
    if len(shoe) < 60:
        shoe = build_shoe(rng)

    player = [shoe.pop(), shoe.pop()]
    dealer = [shoe.pop(), shoe.pop()]

    # Natural blackjack check
    p_bj = hand_value(player)[0] == 21
    d_bj = hand_value(dealer)[0] == 21

    if p_bj and d_bj:
        return bet, bet, 'PUSH', shoe
    if p_bj:
        return bet, bet + int(bet * 1.5), 'BLACKJACK', shoe
    if d_bj:
        return bet, 0, 'LOSS', shoe

    # Player draws using basic strategy
    while True:
        action = basic_strategy_action(player, dealer[0])
        if action == 'STAND':
            break
        player.append(shoe.pop())
        if hand_value(player)[0] > 21:
            return bet, 0, 'BUST', shoe

    # Dealer draws (stands on soft 17)
    while True:
        dv, soft = hand_value(dealer)
        if dv > 17 or (dv == 17 and not soft):
            break
        if dv == 17 and soft:
            break   # stand on soft 17
        dealer.append(shoe.pop())

    pv = hand_value(player)[0]
    dv = hand_value(dealer)[0]

    if dv > 21:
        return bet, bet * 2, 'WIN', shoe
    if pv > dv:
        return bet, bet * 2, 'WIN', shoe
    if pv == dv:
        return bet, bet, 'PUSH', shoe
    return bet, 0, 'LOSS', shoe


def _blackjack_chunk(args):
    chunk_id, n, seed_val = args
    rng  = random.Random(seed_val)
    shoe = build_shoe(rng)
    results = []
    for _ in range(n):
        bet, payout, outcome, shoe = blackjack_round(rng, shoe)
        results.append((bet, payout, outcome))
    return results


# ─── Statistics helpers ───────────────────────────────────────────────────────

def compute_stats(results, game_name):
    bets      = [r[0] for r in results]
    payouts   = [r[1] for r in results]
    outcomes  = [r[2] for r in results]
    net       = [p - b for b, p in zip(bets, payouts)]

    total_wagered  = sum(bets)
    total_returned = sum(payouts)
    rtp            = (total_returned / total_wagered) * 100
    house_edge     = 100 - rtp
    stdev          = statistics.stdev(net)
    n              = len(results)

    # 95% confidence interval for RTP (normal approximation)
    se    = stdev / math.sqrt(n)
    ci_lo = rtp - 1.96 * (se / total_wagered * 100)
    ci_hi = rtp + 1.96 * (se / total_wagered * 100)

    outcome_counts = {}
    for o in outcomes:
        outcome_counts[o] = outcome_counts.get(o, 0) + 1

    # Circuit breaker simulation: how often would 3× loss threshold trigger?
    lockout_count = 0
    running_loss  = 0
    in_lockout    = False
    for b, p in zip(bets, payouts):
        if in_lockout:
            in_lockout = False
            running_loss = 0
            continue
        net_round = p - b
        if net_round < 0:
            running_loss += abs(net_round)
        else:
            running_loss = max(0, running_loss - net_round)
        if running_loss > LOSS_THRESHOLD:
            lockout_count += 1
            in_lockout = True
            running_loss = 0

    return {
        'game':           game_name,
        'iterations':     n,
        'total_wagered':  total_wagered,
        'total_returned': total_returned,
        'rtp':            round(rtp, 4),
        'house_edge':     round(house_edge, 4),
        'stdev':          round(stdev, 4),
        'ci_95':          (round(ci_lo, 4), round(ci_hi, 4)),
        'outcome_counts': outcome_counts,
        'lockout_count':  lockout_count,
        'lockout_rate':   round(lockout_count / n * 100, 4),
    }


# ─── Runner ───────────────────────────────────────────────────────────────────

def run_simulation(seed=None):
    base_seed = seed if seed is not None else int(time.time())
    n_workers = max(1, cpu_count())
    print(f'\nVoyanabet Monte Carlo Simulation')
    print(f'  Iterations:  {ITERATIONS:,} per game')
    print(f'  Chunk size:  {CHUNK_SIZE:,}')
    print(f'  Workers:     {n_workers}')
    print(f'  Base seed:   {base_seed}')

    all_stats = {}

    # ── Slots ──────────────────────────────────────────────────────────────
    print(f'\n[Slots] Running {ITERATIONS:,} rounds...')
    t0 = time.time()
    chunks = [(i, CHUNK_SIZE, base_seed + i) for i in range(N_CHUNKS)]
    slots_results = []

    with Pool(n_workers) as pool:
        for i, chunk in enumerate(pool.imap_unordered(_slots_chunk, chunks), 1):
            slots_results.extend(chunk)
            print(f'  Progress: {i * CHUNK_SIZE:>9,} / {ITERATIONS:,}  ({i * 100 // N_CHUNKS}%)', end='\r')

    print(f'  Progress: {ITERATIONS:,} / {ITERATIONS:,}  (100%)  [{time.time()-t0:.1f}s]')
    all_stats['slots'] = compute_stats(slots_results, 'Slots')

    # ── Blackjack ──────────────────────────────────────────────────────────
    print(f'\n[Blackjack] Running {ITERATIONS:,} rounds...')
    t0 = time.time()
    # Offset seeds so BJ and Slots don't share sequences
    chunks = [(i, CHUNK_SIZE, base_seed + N_CHUNKS + i) for i in range(N_CHUNKS)]
    bj_results = []

    with Pool(n_workers) as pool:
        for i, chunk in enumerate(pool.imap_unordered(_blackjack_chunk, chunks), 1):
            bj_results.extend(chunk)
            print(f'  Progress: {i * CHUNK_SIZE:>9,} / {ITERATIONS:,}  ({i * 100 // N_CHUNKS}%)', end='\r')

    print(f'  Progress: {ITERATIONS:,} / {ITERATIONS:,}  (100%)  [{time.time()-t0:.1f}s]')
    all_stats['blackjack'] = compute_stats(bj_results, 'Blackjack')

    return all_stats, base_seed


def print_summary(stats):
    for game, s in stats.items():
        print(f'\n──── {s["game"].upper()} ────────────────────────────────')
        print(f'  RTP:         {s["rtp"]:.2f}%')
        print(f'  House Edge:  {s["house_edge"]:.2f}%')
        print(f'  Std Dev:     {s["stdev"]:.4f} per round')
        print(f'  95% CI RTP:  [{s["ci_95"][0]:.2f}%, {s["ci_95"][1]:.2f}%]')
        print(f'  Lockout rate:{s["lockout_rate"]:.3f}%  ({s["lockout_count"]:,} triggers)')
        print(f'  Outcomes:')
        for k, v in sorted(s['outcome_counts'].items(), key=lambda x: -x[1]):
            pct = v / s['iterations'] * 100
            print(f'    {k:<14} {v:>9,}  ({pct:.2f}%)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Voyanabet Monte Carlo simulation')
    parser.add_argument('--seed', type=int, default=None, help='RNG seed for reproducibility')
    args = parser.parse_args()

    stats, used_seed = run_simulation(args.seed)
    print_summary(stats)
    print(f'\nSeed used: {used_seed}  (pass --seed {used_seed} to reproduce)')
