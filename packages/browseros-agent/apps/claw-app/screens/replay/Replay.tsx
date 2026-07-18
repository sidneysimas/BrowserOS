/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ArrowLeft, History } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { StatusBadge } from '@/components/cockpit/StatusBadge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReplayFrame } from '@/modules/api/replay.hooks'
import { EventTimeline } from './EventTimeline'
import { PlaybackTransport } from './PlaybackTransport'
import { type ReplayPlayerHandle, ReplayViewport } from './ReplayViewport'
import { buildTabView, EMPTY_TAB_VIEW, useReplayData } from './replay.data'
import { frameIndexAt } from './replay.helpers'
import { targetSeekForFrame } from './tab-view'
import { usePlayback } from './use-playback'

/** Renders the audit replay page and syncs rrweb playback to the transport UI. */
export function Replay() {
  const { replay, isLoading, navigate } = useReplayData()
  const location = useLocation()
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const playerHandleRef = useRef<ReplayPlayerHandle | null>(null)
  const playbackTimeRef = useRef(0)
  const playbackSpeedRef = useRef(1)
  const playbackIsPlayingRef = useRef(true)
  const pendingTargetSeekRef = useRef<number | null>(null)

  useEffect(() => {
    if (!replay) return
    const firstTargetId = replay.targetIds[0] ?? null
    if (firstTargetId === null) {
      if (selectedTargetId !== null) {
        pendingTargetSeekRef.current = 0
        setSelectedTargetId(null)
      }
      return
    }
    if (selectedTargetId === null) {
      setSelectedTargetId(firstTargetId)
      return
    }
    if (!replay.targetIds.includes(selectedTargetId)) {
      pendingTargetSeekRef.current = 0
      setSelectedTargetId(firstTargetId)
    }
  }, [replay, selectedTargetId])

  const tabViewInput = useMemo(
    () =>
      replay
        ? {
            frames: replay.frames,
            eventsForTarget: replay.eventsForTarget,
            startedAtMs: replay.startedAtMs,
          }
        : null,
    [replay],
  )
  const perTabView = useMemo(
    () =>
      tabViewInput
        ? buildTabView(tabViewInput, selectedTargetId)
        : EMPTY_TAB_VIEW,
    [selectedTargetId, tabViewInput],
  )

  const playback = usePlayback(perTabView.totalSeconds)

  useEffect(() => {
    playbackTimeRef.current = playback.time
  }, [playback.time])

  useEffect(() => {
    playbackSpeedRef.current = playback.speed
    playerHandleRef.current?.setSpeed(playback.speed)
  }, [playback.speed])

  useEffect(() => {
    playbackIsPlayingRef.current = playback.isPlaying
  }, [playback.isPlaying])

  useEffect(() => {
    if (!playerHandleRef.current) return
    if (playback.isPlaying) {
      playerHandleRef.current.play(playbackTimeRef.current * 1000)
    } else {
      playerHandleRef.current.pause()
    }
  }, [playback.isPlaying])

  useEffect(() => {
    if (!playback.isPlaying || perTabView.totalSeconds === 0) return
    let rafId = 0
    let active = true
    const sync = () => {
      if (!active) return
      const handle = playerHandleRef.current
      const keepGoing = handle
        ? playback.syncFromPlayer(handle.getCurrentTime() / 1000)
        : true
      if (keepGoing) rafId = window.requestAnimationFrame(sync)
    }
    rafId = window.requestAnimationFrame(sync)
    return () => {
      active = false
      window.cancelAnimationFrame(rafId)
    }
  }, [playback.isPlaying, playback.syncFromPlayer, perTabView.totalSeconds])

  const seekTo = useCallback(
    (seconds: number) => {
      const next = playback.seek(seconds)
      playbackTimeRef.current = next
      playbackIsPlayingRef.current = false
      playerHandleRef.current?.seek(next * 1000)
    },
    [playback.seek],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: target changes must flush pending seeks even when both targets have the same duration.
  useEffect(() => {
    const pendingSeconds = pendingTargetSeekRef.current
    if (pendingSeconds === null) return
    pendingTargetSeekRef.current = null
    seekTo(pendingSeconds)
  }, [seekTo, selectedTargetId])

  const selectTarget = useCallback(
    (targetId: string) => {
      if (targetId === selectedTargetId) {
        seekTo(0)
        return
      }
      pendingTargetSeekRef.current = 0
      setSelectedTargetId(targetId)
    },
    [seekTo, selectedTargetId],
  )

  const selectFrame = useCallback(
    (frame: ReplayFrame) => {
      if (!tabViewInput) return
      const targetSeek = targetSeekForFrame(
        tabViewInput,
        selectedTargetId,
        frame,
      )
      if (
        targetSeek.targetId !== null &&
        targetSeek.targetId !== selectedTargetId
      ) {
        pendingTargetSeekRef.current = targetSeek.seconds
        setSelectedTargetId(targetSeek.targetId)
        return
      }
      seekTo(targetSeek.seconds)
    },
    [seekTo, selectedTargetId, tabViewInput],
  )

  const onPlayerReady = useCallback((handle: ReplayPlayerHandle | null) => {
    playerHandleRef.current = handle
    if (!handle) return
    const ms = playbackTimeRef.current * 1000
    handle.setSpeed(playbackSpeedRef.current)
    handle.seek(ms)
    if (playbackIsPlayingRef.current) handle.play(ms)
  }, [])

  if (isLoading || !replay) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-bg-canvas text-ink-3">
        <Spinner />
      </div>
    )
  }

  // navigate(-1) preserves task detail's original location.state.from
  // (the entry we're moving back to is re-focused, not re-created), so
  // task detail's Back button keeps its cockpit / audit-list target.
  // Doing navigate(`/audit/${sessionId}`) instead would push a new
  // history entry and lose that state.
  //
  // Signal for "reached replay via the in-app flow": task detail's
  // View Replay button seeds location.state.from with the referring
  // pathname. Absence of that flag means direct URL / refresh, so we
  // fall back to the semantic parent. window.history.length is not
  // used because it counts the whole tab's browser history, not just
  // SPA-internal navigations, and can misfire on any prior entry.
  const cameFromInAppFlow =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof (location.state as { from: unknown }).from === 'string'
  const back = () =>
    cameFromInAppFlow ? navigate(-1) : navigate(`/audit/${replay.sessionId}`)
  const currentTabFrameIndex = frameIndexAt(perTabView.frames, playback.time)
  const currentTabFrame = perTabView.frames[currentTabFrameIndex]
  const currentTimelineFrameIndex =
    currentTabFrame?.dispatchId !== undefined
      ? replay.frames.findIndex(
          (frame) => frame.dispatchId === currentTabFrame.dispatchId,
        )
      : -1

  const stats: { label: string; value: string }[] = [
    { label: 'Duration', value: replay.duration },
    { label: 'Steps', value: replay.steps },
  ]

  return (
    <div className="flex h-screen min-h-0 flex-col bg-bg-canvas">
      <header className="flex shrink-0 items-center gap-4 border-border border-b bg-card px-5 py-3">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1.5 font-semibold text-ink-2 text-sm hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Audit trail
        </button>
        <span className="h-5 w-px bg-border-2" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-0.5 font-bold text-[10.5px] text-accent-ink uppercase tracking-wider">
          <History className="size-3" />
          Replay
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink text-sm">
            {replay.taskTitle}
          </div>
          <div className="text-ink-3 text-xs">
            {replay.agentLabel} · {replay.harness}
            {replay.startedAt ? ` · ${replay.startedAt}` : ''}
          </div>
        </div>
        <StatusBadge status={replay.status} />
        <div className="ml-2 flex gap-5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="font-bold text-[10px] text-ink-4 uppercase tracking-wider">
                {stat.label}
              </div>
              <div className="font-bold font-mono text-ink text-sm">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {replay.targetIds.length > 1 && selectedTargetId !== null && (
            <Tabs value={selectedTargetId} onValueChange={selectTarget}>
              <TabsList variant="line">
                {replay.targetIds.map((id, idx) => (
                  <TabsTrigger key={id} value={id}>
                    Tab {idx + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <ReplayViewport
            site={replay.site}
            frame={currentTabFrame}
            events={perTabView.events}
            onPlayerReady={onPlayerReady}
          />
          <PlaybackTransport
            playback={playback}
            totalSeconds={perTabView.totalSeconds}
            frames={perTabView.frames}
            onSeek={seekTo}
          />
        </div>
        <EventTimeline
          frames={replay.frames}
          currentFrameIndex={currentTimelineFrameIndex}
          onSelectFrame={selectFrame}
        />
      </div>
    </div>
  )
}
