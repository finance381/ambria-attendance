import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function Vendors() {
  var [vendors, setVendors] = useState([])
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [showForm, setShowForm] = useState(false)
  var [editId, setEditId] = useState(null)
  var [form, setForm] = useState({ name: '', phone: '', contact_person: '' })
  var [formError, setFormError] = useState('')
  var [saving, setSaving] = useState(false)
  var [deactivateTarget, setDeactivateTarget] = useState(null)
  var [toast, setToast] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    setLoading(true)
    var { data } = await supabase
      .from('vendors')
      .select('id, name, phone, contact_person, active, created_at, employees(count)')
      .eq('employees.is_casual', true)
      .eq('employees.active', true)
      .order('active', { ascending: false })
      .order('name')

    setVendors((data || []).map(function (v) {
      return Object.assign({}, v, { casual_count: v.employees?.[0]?.count || 0 })
    }))
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  function resetForm() {
    setForm({ name: '', phone: '', contact_person: '' })
    setFormError('')
  }

  function openAdd() {
    resetForm()
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(v) {
    setForm({ name: v.name, phone: v.phone || '', contact_person: v.contact_person || '' })
    setFormError('')
    setEditId(v.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    resetForm()
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) return setFormError('Vendor name is required')

    setSaving(true)

    var payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      contact_person: form.contact_person.trim() || null
    }

    if (editId) {
      var { error } = await supabase.from('vendors').update(payload).eq('id', editId)
      setSaving(false)
      if (error) return setFormError(error.message)
      showToast(payload.name + ' updated')
    } else {
      var { error } = await supabase.from('vendors').insert(payload)
      setSaving(false)
      if (error) {
        if (error.message.includes('idx_vendors_name')) return setFormError('Vendor with this name already exists')
        return setFormError(error.message)
      }
      showToast(payload.name + ' added')
    }

    closeForm()
    loadAll()
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    setSaving(true)
    await supabase.from('vendors').update({ active: false }).eq('id', deactivateTarget.id)
    setSaving(false)
    showToast(deactivateTarget.name + ' deactivated')
    setDeactivateTarget(null)
    loadAll()
  }

  async function handleReactivate(v) {
    await supabase.from('vendors').update({ active: true }).eq('id', v.id)
    showToast(v.name + ' reactivated')
    loadAll()
  }

  var filtered = vendors.filter(function (v) {
    if (!search) return true
    var q = search.toLowerCase()
    return v.name.toLowerCase().includes(q) || (v.contact_person && v.contact_person.toLowerCase().includes(q)) || (v.phone && v.phone.includes(q))
  })

  var activeCount = vendors.filter(function (v) { return v.active }).length

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Vendors</h2>
          <p className="text-xs text-gray-500">{activeCount} active vendor{activeCount !== 1 ? 's' : ''} · casual worker agencies</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium">
          + Add Vendor
        </button>
      </div>

      <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
        placeholder="Search name, phone, contact…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-700" />

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Contact Person</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Casuals</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400 italic">No vendors yet</td></tr>
            ) : filtered.map(function (v) {
              return (
                <tr key={v.id} className={'border-b border-gray-100 hover:bg-gray-50' + (!v.active ? ' opacity-50' : '')}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{v.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{v.contact_person || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {v.casual_count > 0 ? (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{v.casual_count}</span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {v.active ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={function () { openEdit(v) }}
                        className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors">Edit</button>
                      {v.active ? (
                        <button onClick={function () { setDeactivateTarget(v) }}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors">Deactivate</button>
                      ) : (
                        <button onClick={function () { handleReactivate(v) }}
                          className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition-colors">Reactivate</button>
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
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{editId ? 'Edit Vendor' : 'Add Vendor'}</h3>
            </div>
            <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Vendor / Agency Name *</label>
                <input type="text" value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })) }}
                  maxLength={100} autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={function (e) { setForm(Object.assign({}, form, { phone: e.target.value })) }}
                  maxLength={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact Person</label>
                <input type="text" value={form.contact_person} onChange={function (e) { setForm(Object.assign({}, form, { contact_person: e.target.value })) }}
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </div>

              {formError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{formError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE CONFIRM */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDeactivateTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Deactivate Vendor</h3>
            <p className="text-sm text-gray-600 mb-4">
              Deactivate <strong>{deactivateTarget.name}</strong>? They won't appear in the vendor dropdown.
              {deactivateTarget.casual_count > 0 && (
                <span className="block mt-1 text-amber-600 text-xs font-medium">
                  ⚠ {deactivateTarget.casual_count} active casual{deactivateTarget.casual_count > 1 ? 's' : ''} linked to this vendor.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setDeactivateTarget(null) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeactivate} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {saving ? 'Processing…' : 'Deactivate'}
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