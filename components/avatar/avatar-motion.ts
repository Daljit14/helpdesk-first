"use client";

import { useCallback, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const AVATAR_ANIMATION_KEY = "hf-avatar-animation";
const AVATAR_ANIMATION_CHANGE_EVENT = "hf-avatar-animation-change";

function subscribeToMotionPreference(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener?.("change", onStoreChange);
  return () => media.removeEventListener?.("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : true;
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    getReducedMotionSnapshot,
    () => true
  );
}

function subscribeToAvatarAnimation(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AVATAR_ANIMATION_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AVATAR_ANIMATION_CHANGE_EVENT, onStoreChange);
  };
}

function getAvatarAnimationSnapshot() {
  try {
    return window.localStorage.getItem(AVATAR_ANIMATION_KEY) !== "off";
  } catch {
    return true;
  }
}

export function useAvatarAnimationPreference(): readonly [
  enabled: boolean,
  setEnabled: (value: boolean) => void,
] {
  const enabled = useSyncExternalStore(
    subscribeToAvatarAnimation,
    getAvatarAnimationSnapshot,
    () => true
  );
  const setEnabled = useCallback((value: boolean) => {
    try {
      if (value) {
        window.localStorage.removeItem(AVATAR_ANIMATION_KEY);
      } else {
        window.localStorage.setItem(AVATAR_ANIMATION_KEY, "off");
      }
    } catch {}
    window.dispatchEvent(new Event(AVATAR_ANIMATION_CHANGE_EVENT));
  }, []);

  return [enabled, setEnabled];
}
