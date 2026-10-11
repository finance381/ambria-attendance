// MarkTestsBanner.jsx
// Home-screen card shown only to employees who are the marker for at least
// one onboarding test that has new joiners. Shows how many scores are still
// pending and links to /mark-tests. Renders nothing otherwise (including when
// the tests_to_mark RPC doesn't exist yet).

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

export default function MarkTestsBanner() {
  var { t } = useLanguage()
  var [counts, setCounts] = useState(null)

  useEffect(function () {
    supabase.rpc('tests_to_mark').then(function ({ data, error }) {
      if (error || !data || data.length === 0) return
      var pending = data.filter(function (r) { return r.score == null }).length
      setCounts({ total: data.length, pending: pending })
    })
  }, [])

  if (!counts) return null

  return (
    <Link to="/mark-tests"
      className={'flex items-center justify-between rounded-2xl px-4 py-3 mb-4 border no-underline ' +
        (counts.pending > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200')}>
      <div>
        <p className={'text-sm font-semibold ' + (counts.pending > 0 ? 'text-indigo-900' : 'text-gray-800')}>📝 {t('mt_title')}</p>
        <p className={'text-[11px] mt-0.5 ' + (counts.pending > 0 ? 'text-indigo-700' : 'text-gray-500')}>
          {counts.pending > 0 ? t('mt_banner_pending', { n: counts.pending }) : t('mt_banner_done')}
        </p>
      </div>
      <span className={counts.pending > 0 ? 'text-indigo-400' : 'text-gray-300'}>›</span>
    </Link>
  )
}
