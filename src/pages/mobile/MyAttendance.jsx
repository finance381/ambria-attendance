export default function MyAttendance() {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">My Attendance</h2>
      <p className="text-xs text-gray-400 mb-5">Calendar view coming soon</p>

      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">📅</span>
        </div>
        <p className="text-sm font-medium text-gray-600 mb-1">Monthly Attendance</p>
        <p className="text-xs text-gray-400">Your attendance history, claims, and leave will appear here.</p>
      </div>
    </div>
  )
}