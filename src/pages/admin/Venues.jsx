import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function Venues() {
  var [venues, setVenues] = useState([])
  var [loading, setLoading] = useState(true)
  var [showAdd, setShowAdd] = useState(false)
  var [editId, setEditId] = useState(null)
  var [saving, setSaving] = useState(false)
  var [toast, setToast] = useState('')
  var [deleteTarget, setDeleteTarget] = useState(null)

  var [form, setForm] = useState({
    name: '', latitude: '', longitude: '', radius_meters: '500'
  })
  var [formError, setFormError] = useState('')
  var [gettingGps, setGettingGps] = useState(false)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    var { data } = await supabase
      .from('venues')
      .select('*')
      .order('id')
    setVenues(data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  function resetForm() {
    setForm({ name: '', latitude: '', longitude: '', radius_meters: '500' })
    setFormError('')
  }

  function openAdd() {
    resetForm()
    setEditId(null)
    setShowAdd(true)
  }

  function openEdit(v) {
    setForm({
      name: v.name,
      latitude: String(v.latitude),
      longitude: String(v.longitude),
      radius_meters: String(v.radius_meters)
    })
    setFormError('')
    setEditId(v.id)
    setShowAdd(true)
  }

  function closeForm() {
    setShowAdd(false)
    setEditId(null)
    resetForm()
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setFormError('Geolocation not supported in this browser')
      return
    }

    setGettingGps(true)
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setForm(function (prev) {
          return {
            ...prev,
            latitude: pos.coords.latitude.toFixed(7),
            longitude: pos.coords.longitude.toFixed(7)
          }
        })
        setGettingGps(false)
      },
      function (err) {
        setFormError('GPS error: ' + err.message)
        setGettingGps(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) return setFormError('Venue name is required')

    var lat = parseFloat(form.latitude)
    var lng = parseFloat(form.longitude)

    if (isNaN(lat) || lat < -90 || lat > 90) return setFormError('Enter a valid latitude (-90 to 90)')
    if (isNaN(lng) || lng < -180 || lng > 180) return setFormError('Enter a valid longitude (-180 to 180)')

    var radius = parseInt(form.radius_meters, 10)
    if (isNaN(radius) || radius < 50 || radius > 5000) return setFormError('Radius must be between 50 and 5000 meters')

    setSaving(true)

    var row = {
      name: form.name.trim(),
      latitude: lat,
      longitude: lng,
      radius_meters: radius,
      active: true
    }

    var result
    if (editId) {
      result = await supabase.from('venues').update(row).eq('id', editId)
    } else {
      result = await supabase.from('venues').insert(row)
    }

    setSaving(false)

    if (result.error) {
      setFormError(result.error.message)
      return
    }

    showToast(editId ? form.name.trim() + ' updated' : form.name.trim() + ' added')
    closeForm()
    loadAll()
  }

  async function handleDeactivate() {
    if (!deleteTarget) return
    setSaving(true)
    await supabase.from('venues').update({ active: false }).eq('id', deleteTarget.id)
    setSaving(false)
    showToast(deleteTarget.name + ' deactivated')
    setDeleteTarget(null)
    loadAll()
  }

  async function handleReactivate(v) {
    setSaving(true)
    await supabase.from('venues').update({ active: true }).eq('id', v.id)
    setSaving(false)
    showToast(v.name + ' reactivated')
    loadAll()
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var activeCount = venues.filter(function (v) { return v.active }).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Venues</h2>
          <p className="text-xs text-gray-500">
            {activeCount} active venue{activeCount !== 1 ? 's' : ''} — GPS proximity is matched within the radius you set
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium"
        >
          + Add Venue
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Venue</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Latitude</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Longitude</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Radius</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {venues.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-gray-400 italic">
                  No venues yet — add your first venue above
                </td>
              </tr>
            ) : venues.map(function (v) {
              return (
                <tr key={v.id} className={'border-b border-gray-100 hover:bg-gray-50' + (!v.active ? ' opacity-50' : '')}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{v.latitude}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{v.longitude}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{v.radius_meters}m</td>
                  <td className="px-4 py-2.5">
                    {v.active ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={function () { openEdit(v) }} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors">Edit</button>
                      {v.active ? (
                        <button onClick={function () { setDeleteTarget(v) }} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors">Deactivate</button>
                      ) : (
                        <button onClick={function () { handleReactivate(v) }} className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition-colors">Reactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ADD / EDIT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{editId ? 'Edit Venue' : 'Add Venue'}</h3>
            </div>
            <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Venue Name *</label>
                <input type="text" value={form.name} onChange={function (e) { setForm({ ...form, name: e.target.value }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                  placeholder="e.g. Ambria Pushpanjali" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Latitude *</label>
                  <input type="text" inputMode="decimal" value={form.latitude} onChange={function (e) { setForm({ ...form, latitude: e.target.value }) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-700"
                    placeholder="28.5850000" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Longitude *</label>
                  <input type="text" inputMode="decimal" value={form.longitude} onChange={function (e) { setForm({ ...form, longitude: e.target.value }) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-700"
                    placeholder="77.0750000" />
                </div>
              </div>

              <button type="button" onClick={useCurrentLocation} disabled={gettingGps}
                className="w-full py-2 text-xs text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors font-medium disabled:opacity-40">
                {gettingGps ? 'Getting location…' : '📍 Use My Current Location'}
              </button>

              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Radius (meters)</label>
                <input type="number" min="50" max="5000" value={form.radius_meters} onChange={function (e) { setForm({ ...form, radius_meters: e.target.value }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
                <p className="text-[10px] text-gray-400 mt-1">Punches within this radius will show this venue name. 500m recommended for indoor GPS drift.</p>
              </div>

              {formError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{formError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Add Venue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDeleteTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Deactivate Venue</h3>
            <p className="text-sm text-gray-600 mb-4">
              Deactivate <strong>{deleteTarget.name}</strong>? Punches will no longer match this venue.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setDeleteTarget(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeactivate} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}