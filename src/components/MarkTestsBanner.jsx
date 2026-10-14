// MarkTestsBanner.jsx
// Home-screen row shown only to employees who are the marker for at least
// one onboarding test that has new joiners. Shows how many scores are still
// pending and links to /mark-tests. Renders nothing otherwise (including when
// the tests_to_mark RPC doesn't exist yet).

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { AlertRow } from './AlertRow'

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
    <Link to="/mark-tests" className="block no-underline">
      <AlertRow
        tone={counts.pending > 0 ? 'indigo' : 'gray'}
        icon="test"
        title={t('mt_title')}
        sub={counts.pending > 0 ? t('mt_banner_pending', { n: counts.pending }) : t('mt_banner_done')}
      />
    </Link>
  )
}
