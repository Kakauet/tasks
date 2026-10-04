"use client"

import { useEffect } from "react"
import { activityEnabled, entityKey, flushActivity, track } from "@/lib/activity"

/** Passive, content-free instrumentation. No requests or third-party SDKs. */
export function ActivityRecorder() {
  useEffect(() => {
    let engaged = document.visibilityState === "visible" && document.hasFocus()
    let lastInput = performance.now()
    let lastPulse = lastInput
    let clicks = 0, moves = 0, distance = 0, scrolls = 0, edits = 0, longTasks = 0, longTaskMs = 0
    let lastPoint: { x:number; y:number } | null = null
    let lastMoveSample = 0
    let lastScroll = 0
    let lastView = "", dialogCount = 0
    const pendingEdits = new Map<string, number>()
    const safeField = (node: Element) => ["title","description","import-text","event-title","event-description","dueDate"].includes(node.id) ? node.id : node.getAttribute("type") === "search" ? "search" : "other"
    const sensitive = (node: Element) => !!node.closest('[type="password"], [type="email"], [type="tel"], [autocomplete="one-time-code"], [autocomplete="email"], [data-private]')
    const context = (target: EventTarget | null) => {
      const node = target instanceof Element ? target : null
      const task = node?.closest<HTMLElement>("[data-task-id]")
      const control = node?.closest<HTMLElement>('button,a,input,textarea,select,[role="tab"],[role="checkbox"],[role="combobox"]')
      const action = control?.dataset.track ?? control?.dataset.action
      return { control: control?.getAttribute("role") ?? control?.tagName.toLowerCase() ?? "surface", action: action && /^[a-z0-9_-]{1,40}$/.test(action) ? action : "generic", entity: task?.dataset.taskId ? entityKey(task.dataset.taskId) : "", dialog: !!node?.closest('[role="dialog"]') }
    }
    const pulse = () => {
      const now = performance.now()
      const elapsed = now-lastPulse
      const activeMs = engaged && activityEnabled() ? Math.max(0, Math.min(now,lastInput+60000)-lastPulse) : 0
      for (const [field,count] of pendingEdits) track("form.edit", {field,count})
      pendingEdits.clear()
      if (activeMs > 0 || clicks || moves || scrolls || edits || longTasks) track("session.pulse", {elapsedMs:Math.round(elapsed),activeMs:Math.round(activeMs),clicks,moves,distancePx:Math.round(distance),scrolls,edits,longTasks,longTaskMs:Math.round(longTaskMs)})
      clicks = moves = distance = scrolls = edits = longTasks = longTaskMs = 0
      lastPulse = now
      void flushActivity()
    }
    const environment = () => track("session.environment", {width:Math.round(innerWidth/100)*100,height:Math.round(innerHeight/100)*100,touch:navigator.maxTouchPoints>0,language:navigator.language.slice(0,30),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,online:navigator.onLine,reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches})
    const click = (event: MouseEvent) => {
      if(!activityEnabled()) return
      lastInput = performance.now(); clicks++
      if (event.target instanceof Element && sensitive(event.target)) return
      track("ui.click", {...context(event.target), x:Math.min(19,Math.max(0,Math.floor(event.clientX/innerWidth*20))),y:Math.min(19,Math.max(0,Math.floor(event.clientY/innerHeight*20))),keyboard:event.detail===0})
    }
    const pointer = (event: PointerEvent) => {
      if(!activityEnabled()) return
      lastInput = performance.now()
      if (lastInput-lastMoveSample<100) return
      lastMoveSample = lastInput; moves++
      if(lastPoint) distance += Math.hypot(event.clientX-lastPoint.x,event.clientY-lastPoint.y)
      lastPoint = {x:event.clientX,y:event.clientY}
    }
    const scroll = (event: Event) => {
      if(!activityEnabled()) return
      lastInput = performance.now(); scrolls++
      if(lastInput-lastScroll<1000) return
      lastScroll = lastInput
      const node = event.target instanceof HTMLElement ? event.target : document.documentElement
      track("ui.scroll", {area:node.classList.contains("task-column-scroll")?"column":"page",depth:Math.round(node.scrollTop/Math.max(1,node.scrollHeight-node.clientHeight)*20)*5})
    }
    const input = (event: Event) => {
      if(!activityEnabled()) return
      lastInput = performance.now()
      if(!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) || sensitive(event.target)) return
      edits++
      const field = safeField(event.target)
      pendingEdits.set(field,(pendingEdits.get(field)??0)+1)
    }
    const change = (event: Event) => {
      if(!activityEnabled()) return
      if (!(event.target instanceof Element) || sensitive(event.target)) return
      track("form.change", {...context(event.target),field:safeField(event.target)})
    }
    const key = (event: KeyboardEvent) => {
      if(!activityEnabled()) return
      lastInput = performance.now()
      if(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return
      const name = event.key.toLowerCase()
      if((event.ctrlKey||event.metaKey) && ["z","y","f"].includes(name)) track("ui.shortcut",{key:name,shift:event.shiftKey})
      else if(["escape","tab"].includes(name)) track("ui.navigation_key",{key:name,shift:event.shiftKey})
    }
    const visibility = () => { pulse(); engaged=document.visibilityState==="visible" && document.hasFocus(); lastInput=performance.now(); track("session.visibility",{visible:document.visibilityState==="visible"}); void flushActivity() }
    const focus = () => { pulse(); engaged=true; lastInput = performance.now(); lastPulse = lastInput; track("session.focus") }
    const blur = () => { pulse(); engaged=false; track("session.blur"); void flushActivity() }
    const network = () => track("session.network",{online:navigator.onLine})
    const hide = () => { pulse(); track("session.pagehide"); void flushActivity() }
    const error = () => track("runtime.error")
    const rejected = () => track("runtime.rejection")
    const reset = () => { pendingEdits.clear(); clicks=moves=distance=scrolls=edits=longTasks=longTaskMs=0;lastPoint=null;lastInput=lastPulse=performance.now();engaged=document.visibilityState==="visible"&&document.hasFocus() }
    const preference = () => { reset(); if(activityEnabled()) { track("session.resume"); environment() } }
    const storage = (event: StorageEvent) => { if(event.key==="taskmaster-activity-enabled") preference() }
    const observer = new MutationObserver(() => {
      if(!activityEnabled()) return
      const view = document.querySelector('[role="tab"][aria-selected="true"]')?.id
      if(view && ["board-tab","calendar-tab"].includes(view) && view!==lastView) { lastView=view;track("view.change",{view}) }
      const count = document.querySelectorAll('[role="dialog"]').length
      if(count!==dialogCount) { track(count>dialogCount?"dialog.open":"dialog.close",{count});dialogCount=count }
    })
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-selected"]})
    let performanceObserver: PerformanceObserver | undefined
    try { performanceObserver = new PerformanceObserver(list => {if(!activityEnabled()) return;for(const entry of list.getEntries()){longTasks++;longTaskMs+=entry.duration}}); performanceObserver.observe({type:"longtask",buffered:false}) } catch { /* optional browser metric */ }
    track("session.start");environment()
    document.addEventListener("click",click,true)
    document.addEventListener("pointermove",pointer,{passive:true})
    document.addEventListener("scroll",scroll,{capture:true,passive:true})
    document.addEventListener("input",input,true)
    document.addEventListener("change",change,true)
    document.addEventListener("keydown",key,true)
    document.addEventListener("visibilitychange",visibility)
    window.addEventListener("focus",focus);window.addEventListener("blur",blur)
    window.addEventListener("online",network);window.addEventListener("offline",network)
    window.addEventListener("pagehide",hide);window.addEventListener("error",error);window.addEventListener("unhandledrejection",rejected)
    window.addEventListener("activity-cleared",reset);window.addEventListener("activity-preference",preference);window.addEventListener("storage",storage)
    const pulseTimer = window.setInterval(pulse,15000)
    const saveTimer = window.setInterval(()=>void flushActivity(),5000)
    return () => {
      pulse();observer.disconnect();performanceObserver?.disconnect()
      clearInterval(pulseTimer);clearInterval(saveTimer)
      document.removeEventListener("click",click,true);document.removeEventListener("pointermove",pointer)
      document.removeEventListener("scroll",scroll,true);document.removeEventListener("input",input,true);document.removeEventListener("change",change,true)
      document.removeEventListener("keydown",key,true);document.removeEventListener("visibilitychange",visibility)
      window.removeEventListener("focus",focus);window.removeEventListener("blur",blur);window.removeEventListener("online",network);window.removeEventListener("offline",network)
      window.removeEventListener("pagehide",hide);window.removeEventListener("error",error);window.removeEventListener("unhandledrejection",rejected)
      window.removeEventListener("activity-cleared",reset);window.removeEventListener("activity-preference",preference);window.removeEventListener("storage",storage)
    }
  },[])
  return null
}
