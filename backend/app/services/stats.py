"""Small, dependency-free Beta distribution helpers.

OpsPilot keeps its runtime dependency set minimal; these routines follow the standard
continued-fraction evaluation of the regularized incomplete beta function (Numerical
Recipes, section 6.4) and are pinned to SciPy reference values in the test suite.
"""

import hashlib
import math

_MAX_ITERATIONS = 300
_EPSILON = 3e-14
_TINY = 1e-300


def _beta_continued_fraction(a: float, b: float, x: float) -> float:
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > _TINY else _TINY)
    h = d
    for m in range(1, _MAX_ITERATIONS + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > _TINY else _TINY)
        c = 1.0 + aa / c
        c = c if abs(c) > _TINY else _TINY
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > _TINY else _TINY)
        c = 1.0 + aa / c
        c = c if abs(c) > _TINY else _TINY
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPSILON:
            break
    return h


def beta_cdf(x: float, a: float, b: float) -> float:
    """Regularized incomplete beta I_x(a, b) for a, b > 0."""
    if a <= 0 or b <= 0:
        raise ValueError("Beta parameters must be positive")
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_front = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x)
    front = math.exp(log_front)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _beta_continued_fraction(a, b, x) / a
    return 1.0 - front * _beta_continued_fraction(b, a, 1.0 - x) / b


def beta_ppf(q: float, a: float, b: float) -> float:
    """Inverse CDF by bisection; monotone and accurate to ~1e-12 in [0, 1]."""
    if not 0.0 <= q <= 1.0:
        raise ValueError("Quantile must be in [0, 1]")
    low, high = 0.0, 1.0
    for _ in range(80):
        mid = (low + high) / 2.0
        if beta_cdf(mid, a, b) < q:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def stable_unit_interval(*parts: str) -> float:
    """Deterministic pseudo-random number in [0, 1) derived from identifiers.

    Used for reproducible random ordering (sampling without replacement) and synthetic
    demo outcomes. Not suitable for security purposes.
    """
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(1 << 64)
