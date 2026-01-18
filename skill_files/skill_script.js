(() => {
  const track = document.getElementById("mediaGalleryTrack");
  if (!track) return;

  const dotsContainer = document.getElementById("mediaDots");
  const dots = dotsContainer
    ? Array.from(dotsContainer.querySelectorAll(".media-dot"))
    : [];

  // Original (real) items (before cloning)
  const realItems = Array.from(track.querySelectorAll(".media-gallery-item"));
  const realCount = realItems.length;
  if (realCount === 0) return;

  // ---- Create edge clones so there is always a left + right neighbor visible ----
  // DOM order after cloning: [lastClone, real1..realN, firstClone]
  const firstClone = realItems[0].cloneNode(true);
  const lastClone = realItems[realCount - 1].cloneNode(true);

  firstClone.classList.add("is-clone");
  lastClone.classList.add("is-clone");
  firstClone.setAttribute("aria-hidden", "true");
  lastClone.setAttribute("aria-hidden", "true");
  firstClone.setAttribute("tabindex", "-1");
  lastClone.setAttribute("tabindex", "-1");

  track.insertBefore(lastClone, realItems[0]);
  track.appendChild(firstClone);

  // Items including clones
  const items = Array.from(track.querySelectorAll(".media-gallery-item"));
  const firstRealDomIndex = 1;
  const lastRealDomIndex = realCount;

  // Active DOM index (includes clones). Start on first real slide.
  let activeDomIndex = firstRealDomIndex;

  let isPaused = false;
  let timerId = null;

  const getViewport = () => track.parentElement;

  const getTranslateX = () => {
    const style = window.getComputedStyle(track);
    const t = style.transform;
    if (!t || t === "none") return 0;
    const m = new DOMMatrixReadOnly(t);
    return m.m41;
  };

  const getRealIndexFromDom = (domIndex) => {
    // Maps DOM index (with clones) -> [0..realCount-1]
    if (domIndex === 0) return realCount - 1; // lastClone
    if (domIndex === items.length - 1) return 0; // firstClone
    return domIndex - firstRealDomIndex;
  };

  const updateDots = () => {
    if (!dots.length) return;
    const realIndex = getRealIndexFromDom(activeDomIndex);
    dots.forEach((dot, i) => {
      const isActive = i === realIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-current", isActive ? "true" : "false");
    });
  };

  const centerDomIndex = (domIndex, behavior = "smooth") => {
    const viewport = getViewport();
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;

    // Track rect includes the current transform; remove it to get the "base" left position.
    const currentX = getTranslateX();
    const trackRect = track.getBoundingClientRect();
    const trackBaseLeft = trackRect.left - currentX;

    const item = items[domIndex];
    if (!item) return;

    const itemCenterInTrack = item.offsetLeft + item.offsetWidth / 2;

    // Absolute translateX needed so that the item's center aligns with the viewport center.
    const nextX = viewportCenter - (trackBaseLeft + itemCenterInTrack);

    track.style.transition = behavior === "auto" ? "none" : "transform 500ms ease";
    track.style.transform = `translateX(${nextX}px)`;

    if (behavior === "auto") {
      requestAnimationFrame(() => {
        track.style.transition = "transform 500ms ease";
      });
    }
  };

  const updateA11y = () => {
    items.forEach((item, idx) => {
      const isClone = item.classList.contains("is-clone");
      const isActive = !isClone && idx === activeDomIndex;

      item.classList.toggle("is-active", isActive);

      if (isClone) {
        item.setAttribute("aria-hidden", "true");
        item.setAttribute("tabindex", "-1");
      } else {
        // Keep real items visible/available; only the active one should be tabbable.
        item.setAttribute("aria-hidden", "false");
        item.setAttribute("tabindex", isActive ? "0" : "-1");
      }
    });
  };

  const goToDomIndex = (domIndex, behavior = "smooth") => {
    activeDomIndex = domIndex;
    centerDomIndex(activeDomIndex, behavior);
    updateA11y();
    updateDots();
  };

  const next = () => goToDomIndex(activeDomIndex + 1);
  const prev = () => goToDomIndex(activeDomIndex - 1);

  // When we slide onto a clone, immediately jump (no animation) to the matching real slide.
  const normalizeIfOnClone = () => {
    if (activeDomIndex === 0) {
      activeDomIndex = lastRealDomIndex;
      centerDomIndex(activeDomIndex, "auto");
      updateA11y();
      updateDots();
    } else if (activeDomIndex === items.length - 1) {
      activeDomIndex = firstRealDomIndex;
      centerDomIndex(activeDomIndex, "auto");
      updateA11y();
      updateDots();
    }
  };

  // Keep activeDomIndex in bounds (includes clones)
  const clampDomIndex = (i) => {
    if (i < 0) return 0;
    if (i > items.length - 1) return items.length - 1;
    return i;
  };

  const startTimer = () => {
    stopTimer();
    timerId = window.setInterval(() => {
      if (!isPaused) next();
    }, 10000);
  };

  const stopTimer = () => {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  };

  const setPaused = (paused) => {
    isPaused = paused;
    // Visual state on dots container (optional)
    if (dotsContainer) dotsContainer.classList.toggle("is-paused", paused);
  };

  // Dots navigation
  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      const realIndex = getRealIndexFromDom(activeDomIndex);

      // If you click the active dot, toggle pause/play.
      if (index === realIndex) {
        setPaused(!isPaused);
        return;
      }

      const targetDomIndex = firstRealDomIndex + index;
      goToDomIndex(targetDomIndex);
      startTimer(); // reset autoplay
    });
  });

  // Click on any visible card to bring it to the center (event delegation).
  track.addEventListener("click", (e) => {
    const item = e.target.closest(".media-gallery-item");
    if (!item || !track.contains(item)) return;

    const domIndex = items.indexOf(item);
    if (domIndex === -1 || domIndex === activeDomIndex) return;

    goToDomIndex(domIndex);
    startTimer();
  });

  // Keyboard controls when focused
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
      startTimer();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
      startTimer();
    } else if (e.key === " ") {
      e.preventDefault();
      setPaused(!isPaused);
    }
  });

  // Normalize after the animated transition finishes
  track.addEventListener("transitionend", (e) => {
    if (e.propertyName !== "transform") return;
    normalizeIfOnClone();
  });

  // Re-center on resize
  window.addEventListener("resize", () => {
    centerDomIndex(activeDomIndex, "auto");
  });

  // ---- Gestures: swipe on touch devices and trackpad horizontal scroll ----
  const viewport = getViewport();

  // Touch/pointer swipe (left/right)
  let swipeStartX = 0;
  let swipeStartY = 0;
  let isSwiping = false;

  const SWIPE_X_THRESHOLD = 35; // px
  const SWIPE_Y_TOLERANCE = 60; // px

  const beginSwipe = (x, y) => {
    swipeStartX = x;
    swipeStartY = y;
    isSwiping = true;
  };

  const endSwipe = (x, y) => {
    if (!isSwiping) return;
    isSwiping = false;

    const dx = x - swipeStartX;
    const dy = y - swipeStartY;

    if (Math.abs(dx) < SWIPE_X_THRESHOLD) return;
    if (Math.abs(dy) > SWIPE_Y_TOLERANCE && Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) next();
    else prev();

    startTimer();
  };

  if (viewport) {
    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      beginSwipe(e.clientX, e.clientY);
    });

    viewport.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      endSwipe(e.clientX, e.clientY);
    });

    viewport.addEventListener("pointercancel", () => {
      isSwiping = false;
    });

    // Fallback for older iOS/Safari: touch events
    viewport.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        beginSwipe(t.clientX, t.clientY);
      },
      { passive: true }
    );

    viewport.addEventListener("touchend", (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      endSwipe(t.clientX, t.clientY);
    });

    // Trackpad swipe: horizontal wheel scroll (deltaX)
    // Lock after first nav; unlock only after wheel stream goes idle.
    let wheelAccumX = 0;
    let lastWheelTs = 0;
    let wheelLocked = false;
    let wheelUnlockTimer = null;
    const WHEEL_ACCUM_THRESHOLD = 80;
    const WHEEL_IDLE_UNLOCK_MS = 260;

    const scheduleWheelUnlock = () => {
      if (wheelUnlockTimer) window.clearTimeout(wheelUnlockTimer);
      wheelUnlockTimer = window.setTimeout(() => {
        wheelLocked = false;
        wheelAccumX = 0;
      }, WHEEL_IDLE_UNLOCK_MS);
    };

    viewport.addEventListener(
      "wheel",
      (e) => {
        const dx = e.deltaX;
        const dy = e.deltaY;

        if (Math.abs(dx) <= Math.abs(dy)) return;
        if (Math.abs(dx) < 5) return;

        const now = Date.now();
        if (now - lastWheelTs > 220) wheelAccumX = 0;
        lastWheelTs = now;

        scheduleWheelUnlock();

        if (wheelLocked) {
          e.preventDefault();
          return;
        }

        wheelAccumX += dx;

        if (Math.abs(wheelAccumX) >= WHEEL_ACCUM_THRESHOLD) {
          if (wheelAccumX > 0) next();
          else prev();
          wheelLocked = true;
          wheelAccumX = 0;
          startTimer();
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }

  // Ensure all images are loaded before first centering
  const whenImagesReady = Promise.all(
    items.map((item) => {
      const img = item.querySelector("img");
      if (!img) return Promise.resolve();
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  );

  whenImagesReady.then(() => {
    track.style.transform = "translateX(0px)";
    goToDomIndex(firstRealDomIndex, "auto");
    startTimer();
    setPaused(false);
  });
})();
