import { useEffect, useRef, useState } from 'react'

var THRESHOLD = 64
var MAX_PULL = 100

export default function PullToRefresh({ children }) {
  var [pullDistance, setPullDistance] = useState(0)
  var [refreshing, setRefreshing] = useState(false)
  var [dragging, setDragging] = useState(false)
  var startY = useRef(0)
  var tracking = useRef(false)

  useEffect(function () {
    function atTop() {
      return (document.scrollingElement || document.documentElement).scrollTop <= 0
    }

    function onTouchStart(e) {
      if (refreshing || e.touches.length !== 1 || !atTop()) return
      startY.current = e.touches[0].clientY
      tracking.current = true
      setDragging(true)
    }

    function onTouchMove(e) {
      if (!tracking.current || refreshing) return
      var delta = e.touches[0].clientY - startY.current
      if (delta <= 0 || !atTop()) {
        tracking.current = false
        setDragging(false)
        setPullDistance(0)
        return
      }
      setPullDistance(Math.min(delta * 0.5, MAX_PULL))
      e.preventDefault()
    }

    function onTouchEnd() {
      if (!tracking.current) return
      tracking.current = false
      setDragging(false)
      if (pullDistance >= THRESHOLD) {
        setRefreshing(true)
        setPullDistance(40)
        window.location.reload()
      } else {
        setPullDistance(0)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return function () {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullDistance, refreshing])

  var showSpinner = pullDistance > 0 || refreshing
  var armed = refreshing || pullDistance >= THRESHOLD

  return (
    <div>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: pullDistance,
          transition: dragging ? 'none' : 'height 200ms ease-out'
        }}
      >
        {showSpinner && (
          <div
            className={'w-5 h-5 border-2 border-slate-500 rounded-full ' +
              (armed ? 'border-t-transparent animate-spin' : 'border-t-transparent')}
            style={armed ? undefined : { transform: 'rotate(' + Math.min(pullDistance * 3, 300) + 'deg)' }}
          />
        )}
      </div>
      {children}
    </div>
  )
}
