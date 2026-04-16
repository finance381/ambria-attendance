import { createContext, useContext, useState, useCallback } from 'react'

var translations = {
  en: {
    // ── General ──────────────────────────────
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    done: 'Done',
    back: 'Back',
    later: 'Later',

    // ── Login ────────────────────────────────
    login_title: 'Ambria Attendance',
    login_subtitle: 'Sign in with your phone number',
    login_phone_label: 'Phone Number',
    login_password_label: 'Password',
    login_phone_placeholder: '9876543210',
    login_password_placeholder: 'Enter password',
    login_submit: 'Sign In',
    login_submitting: 'Signing in…',
    login_admin_help: 'Contact your admin if you need access',
    login_err_phone: 'Enter a valid 10-digit phone number',
    login_err_password: 'Enter your password',
    login_err_invalid: 'Invalid phone number or password',

    // ── Shell / Nav ──────────────────────────
    app_name: 'Ambria Attendance',
    tab_home: 'Home',
    tab_team: 'Team',
    tab_claims: 'Claims',
    tab_dar: 'DAR',
    tab_attendance: 'Attendance',
    tab_settings: 'Settings',

    // ── Home ─────────────────────────────────
    home_greeting: 'Hi',
    home_status: 'Status',
    home_punched_in: 'Punched In',
    home_not_punched_in: 'Not Punched In',
    home_since: 'Since',
    home_sessions: 'session',
    home_sessions_plural: 'sessions',
    home_stale_title: 'Unresolved punch from a previous day',
    home_stale_desc: 'Submit a missed punch claim to resolve it.',
    home_today_punches: "Today's Punches",
    home_punch_in: 'Punch In',
    home_punch_out: 'Punch Out',

    // ── Punch Capture ────────────────────────
    punch_btn_in: 'Punch In',
    punch_btn_out: 'Punch Out',
    punch_opening_camera: 'Opening camera…',
    punch_recording: 'Recording attendance…',
    punch_done_in: 'Punched In!',
    punch_done_out: 'Punched Out!',
    punch_try_again: 'Try Again',
    dar_reminder_title: 'DAR Reminder',
    dar_reminder: 'Remember to write your DAR in the group!',
    dar_ok: 'OK, Got it',

    // ── My Attendance ────────────────────────
    attendance_title: 'My Attendance',
    attendance_present: 'Present',
    attendance_half_day: 'Half Day',
    attendance_absent: 'Absent',
    attendance_incomplete: 'Incomplete',
    attendance_half: 'Half',
    attendance_hours: 'Hours',
    attendance_sessions: 'session',
    attendance_sessions_plural: 'sessions',
    attendance_no_punches: 'No punches recorded',
    month_1: 'January', month_2: 'February', month_3: 'March',
    month_4: 'April', month_5: 'May', month_6: 'June',
    month_7: 'July', month_8: 'August', month_9: 'September',
    month_10: 'October', month_11: 'November', month_12: 'December',
    day_su: 'Su', day_mo: 'Mo', day_tu: 'Tu', day_we: 'We',
    day_th: 'Th', day_fr: 'Fr', day_sa: 'Sa',

    // ── My Claims ────────────────────────────
    claims_title: 'Missed Punch Claims',
    claims_used: '{used} of {limit} claims used this month',
    claims_remaining: '{n} remaining',
    claims_new: '+ New Claim',
    claims_date: 'Date',
    claims_type: 'Type',
    claims_missed_out: 'Missed Punch Out',
    claims_missed_in: 'Missed Punch In',
    claims_time: 'Approximate Time',
    claims_reason: 'Reason',
    claims_reason_placeholder: 'Why did you miss this punch?',
    claims_submitting: 'Submitting…',
    claims_submit: 'Submit Claim',
    claims_empty: 'No claims submitted yet',
    claims_missed_in_short: 'Missed In',
    claims_missed_out_short: 'Missed Out',
    claims_time_label: 'Time',
    claims_reviewed_by: 'Reviewed by',
    claims_status_pending: 'pending',
    claims_status_approved: 'approved',
    claims_status_rejected: 'rejected',
    claims_err_date: 'Select a date',
    claims_err_time: 'Enter the approximate time',
    claims_err_reason: 'Reason is required',
    claims_toast_submitted: 'Claim submitted — {used} of {limit} used this month',

    // ── Punch for Team ───────────────────────
    team_title: 'Punch for Team',
    team_subtitle: 'Proxy punch for casuals and team members',
    team_tab_punch: 'Punch',
    team_tab_open: 'Open',
    team_tab_add: '+ Add Casual',
    team_no_casuals: 'No casuals registered',
    team_add_casual_link: 'Add a casual worker',
    team_punch_in: 'Punch In',
    team_punch_out: 'Punch Out',
    team_camera: 'Camera…',
    team_uploading: 'Uploading…',
    team_casual_tag: 'casual',
    team_no_open: 'No open punches — all resolved',
    team_hours_ago: '{n}h ago',
    team_punch_out_now: 'Punch Out Now',
    team_enter_time: 'Enter Time from Register',
    team_name: 'Name',
    team_department: 'Department',
    team_name_placeholder: 'Full name',
    team_select_dept: '— Select —',
    team_adding: 'Adding…',
    team_add_casual_btn: 'Add Casual Worker',
    team_name_exists: '"{name}" already exists in this department. Same person?',
    team_yes_same: 'Yes, same person',
    team_no_create: 'No, create new',
    team_retro_title: 'Retroactive Punch-Out',
    team_retro_time_label: 'Out Time (from physical register)',
    team_retro_help: 'Punched in at {time}. Enter the departure time from the register. This will be flagged as a late entry.',
    team_err_name: 'Name is required',
    team_err_dept: 'Select a department',
    team_err_retro_time: 'Enter the out time from the register',

    // ── Settings ─────────────────────────────
    settings_title: 'Settings',
    settings_emp_code: 'Employee Code',
    settings_phone: 'Phone',
    settings_role: 'Role',
    settings_leave_balance: 'Leave Balance',
    settings_fy: 'FY',
    settings_used: 'used',
    settings_change_pw: 'Change Password',
    settings_new_pw: 'New Password',
    settings_confirm_pw: 'Confirm Password',
    settings_pw_placeholder: 'Min 6 characters',
    settings_pw_confirm_placeholder: 'Type again',
    settings_pw_update: 'Update Password',
    settings_pw_err_length: 'Password must be at least 6 characters',
    settings_pw_err_match: 'Passwords do not match',
    settings_pw_success: 'Password changed successfully',
    settings_admin_link: 'Admin Dashboard',
    settings_admin_hint: 'Opens in new tab →',
    settings_signout: 'Sign Out',
    settings_notif_title: 'Notifications',
    settings_notif_desc: 'Get reminded to punch in and out',
    settings_notif_checking: 'Checking…',
    settings_notif_off: 'Turn Off',
    settings_notif_enable: 'Enable',
    settings_reminders: 'Daily Reminders',
    settings_reminder_in: 'Punch In Reminder',
    settings_reminder_out: 'Punch Out Reminder',
    settings_save_reminders: 'Save Reminders',
    settings_notif_also: "You'll also get notified when your claims are approved or rejected.",
    settings_leave_error: 'Leave balance error',
    settings_quarterly: 'Quarterly',
    settings_halfday_balance: 'Half Day Balance',
    

    // ── Install Prompt ───────────────────────
    install_title: 'Install App',
    install_desc: 'Add to home screen for quick access',
    install_btn: 'Install',
    install_ios_desc: 'Get the full app experience',
    install_ios_step1: 'Tap the',
    install_ios_share: 'Share',
    install_ios_step1_end: 'button below',
    install_ios_step2: 'Scroll down and tap',
    install_ios_step2_bold: 'Add to Home Screen',
    install_ios_step3: 'Tap',
    install_ios_step3_bold: 'Add',
    install_ios_step3_end: 'in the top right',
    install_ios_other: 'Open this page in',
    install_ios_safari: 'Safari',
    install_ios_other_end: 'to install. Tap the share icon, then "Add to Home Screen".',

    // ── DAR Writer ──────────────────────────
    dar_title: 'Daily Activity Report',
    dar_date: 'DAR Date',
    dar_punch_in: 'Punch In',
    dar_punch_out: 'Punch Out',
    dar_punch_auto: 'Auto-fetched from attendance',
    dar_punch_manual: 'No punch record — enter manually',
    dar_tasks: 'Tasks',
    dar_tasks_placeholder: 'e.g. Coordinated with vendor for event setup\nChecked on running ads and resolved issues\nHad discussion with team regarding workflow',
    dar_submit: 'Submit DAR',
    dar_confirm_title: 'Confirm Submission',
    dar_confirm_msg: 'Once submitted, this DAR cannot be edited. Are you sure?',
    dar_confirm_final: 'Final Confirmation',
    dar_confirm_final_msg: 'Please review one last time. This action is permanent.',
    dar_confirm_yes: 'Yes, Submit',
    dar_confirm_back: 'Go Back & Edit',
    dar_submitted: 'DAR submitted successfully',
    dar_exists: 'DAR already submitted for this date',
    dar_history: 'Past DARs',
    dar_no_history: 'No DARs submitted yet',
    dar_err_tasks: 'Please enter your tasks',
    dar_err_punchin: 'Please enter punch-in time',
    dar_preview: 'Preview DAR',
  },

  hi: {
    // ── General ──────────────────────────────
    loading: 'लोड हो रहा…',
    cancel: 'रद्द करें',
    save: 'सेव करें',
    saving: 'सेव हो रहा…',
    done: 'हो गया',
    back: 'वापस',
    later: 'बाद में',

    // ── Login ────────────────────────────────
    login_title: 'Ambria Attendance',
    login_subtitle: 'अपने फ़ोन नंबर से लॉगिन करें',
    login_phone_label: 'फ़ोन नंबर',
    login_password_label: 'पासवर्ड',
    login_phone_placeholder: '9876543210',
    login_password_placeholder: 'पासवर्ड दर्ज करें',
    login_submit: 'लॉगिन',
    login_submitting: 'लॉगिन हो रहा…',
    login_admin_help: 'एक्सेस के लिए अपने एडमिन से संपर्क करें',
    login_err_phone: '10 अंकों का सही फ़ोन नंबर दर्ज करें',
    login_err_password: 'पासवर्ड दर्ज करें',
    login_err_invalid: 'गलत फ़ोन नंबर या पासवर्ड',

    // ── Shell / Nav ──────────────────────────
    app_name: 'Ambria Attendance',
    tab_home: 'होम',
    tab_team: 'टीम',
    tab_claims: 'क्लेम',
    tab_dar: 'DAR',
    tab_attendance: 'हाज़िरी',
    tab_settings: 'सेटिंग्स',

    // ── Home ─────────────────────────────────
    home_greeting: 'नमस्ते',
    home_status: 'स्थिति',
    home_punched_in: 'पंच इन हो गया',
    home_not_punched_in: 'पंच इन नहीं है',
    home_since: 'तब से',
    home_sessions: 'सत्र',
    home_sessions_plural: 'सत्र',
    home_stale_title: 'पिछले दिन का पंच अधूरा है',
    home_stale_desc: 'इसे ठीक करने के लिए मिस्ड पंच क्लेम दर्ज करें।',
    home_today_punches: 'आज के पंच',
    home_punch_in: 'पंच इन',
    home_punch_out: 'पंच आउट',

    // ── Punch Capture ────────────────────────
    punch_btn_in: 'पंच इन',
    punch_btn_out: 'पंच आउट',
    punch_opening_camera: 'कैमरा खुल रहा…',
    punch_recording: 'हाज़िरी दर्ज हो रही…',
    punch_done_in: 'पंच इन हो गया!',
    punch_done_out: 'पंच आउट हो गया!',
    punch_try_again: 'फिर कोशिश करें',
    dar_reminder_title: 'DAR रिमाइंडर',
    dar_reminder: 'अपने ग्रुप में DAR लिखना न भूलें!',
    dar_ok: 'ठीक है',

    // ── My Attendance ────────────────────────
    attendance_title: 'मेरी हाज़िरी',
    attendance_present: 'उपस्थित',
    attendance_half_day: 'आधा दिन',
    attendance_absent: 'अनुपस्थित',
    attendance_incomplete: 'अपूर्ण',
    attendance_half: 'आधा',
    attendance_hours: 'घंटे',
    attendance_sessions: 'सत्र',
    attendance_sessions_plural: 'सत्र',
    attendance_no_punches: 'कोई पंच दर्ज नहीं',
    month_1: 'जनवरी', month_2: 'फ़रवरी', month_3: 'मार्च',
    month_4: 'अप्रैल', month_5: 'मई', month_6: 'जून',
    month_7: 'जुलाई', month_8: 'अगस्त', month_9: 'सितम्बर',
    month_10: 'अक्टूबर', month_11: 'नवम्बर', month_12: 'दिसम्बर',
    day_su: 'र', day_mo: 'सो', day_tu: 'मं', day_we: 'बु',
    day_th: 'गु', day_fr: 'शु', day_sa: 'श',

    // ── My Claims ────────────────────────────
    claims_title: 'मिस्ड पंच क्लेम',
    claims_used: 'इस महीने {limit} में से {used} क्लेम इस्तेमाल हुए',
    claims_remaining: '{n} बाकी',
    claims_new: '+ नया क्लेम',
    claims_date: 'तारीख़',
    claims_type: 'प्रकार',
    claims_missed_out: 'पंच आउट भूल गए',
    claims_missed_in: 'पंच इन भूल गए',
    claims_time: 'अनुमानित समय',
    claims_reason: 'कारण',
    claims_reason_placeholder: 'पंच क्यों छूट गया?',
    claims_submitting: 'भेजा जा रहा…',
    claims_submit: 'क्लेम भेजें',
    claims_empty: 'अभी कोई क्लेम नहीं है',
    claims_missed_in_short: 'मिस्ड इन',
    claims_missed_out_short: 'मिस्ड आउट',
    claims_time_label: 'समय',
    claims_reviewed_by: 'समीक्षा —',
    claims_status_pending: 'लंबित',
    claims_status_approved: 'स्वीकृत',
    claims_status_rejected: 'अस्वीकृत',
    claims_err_date: 'तारीख़ चुनें',
    claims_err_time: 'अनुमानित समय दर्ज करें',
    claims_err_reason: 'कारण ज़रूरी है',
    claims_toast_submitted: 'क्लेम भेजा गया — इस महीने {limit} में से {used} इस्तेमाल हुए',

    // ── Punch for Team ───────────────────────
    team_title: 'टीम के लिए पंच',
    team_subtitle: 'कैज़ुअल और टीम मेंबर्स की प्रॉक्सी पंच',
    team_tab_punch: 'पंच',
    team_tab_open: 'खुले',
    team_tab_add: '+ कैज़ुअल जोड़ें',
    team_no_casuals: 'कोई कैज़ुअल रजिस्टर नहीं',
    team_add_casual_link: 'कैज़ुअल वर्कर जोड़ें',
    team_punch_in: 'पंच इन',
    team_punch_out: 'पंच आउट',
    team_camera: 'कैमरा…',
    team_uploading: 'अपलोड…',
    team_casual_tag: 'कैज़ुअल',
    team_no_open: 'कोई खुला पंच नहीं — सब ठीक है',
    team_hours_ago: '{n} घंटे पहले',
    team_punch_out_now: 'अभी पंच आउट करें',
    team_enter_time: 'रजिस्टर से समय दर्ज करें',
    team_name: 'नाम',
    team_department: 'विभाग',
    team_name_placeholder: 'पूरा नाम',
    team_select_dept: '— चुनें —',
    team_adding: 'जोड़ा जा रहा…',
    team_add_casual_btn: 'कैज़ुअल वर्कर जोड़ें',
    team_name_exists: '"{name}" इस विभाग में पहले से है। वही व्यक्ति है?',
    team_yes_same: 'हाँ, वही है',
    team_no_create: 'नहीं, नया बनाएं',
    team_retro_title: 'बाद में पंच-आउट',
    team_retro_time_label: 'आउट टाइम (रजिस्टर से)',
    team_retro_help: '{time} पर पंच इन हुआ था। रजिस्टर से जाने का समय दर्ज करें। यह लेट एंट्री के रूप में दर्ज होगा।',
    team_err_name: 'नाम ज़रूरी है',
    team_err_dept: 'विभाग चुनें',
    team_err_retro_time: 'रजिस्टर से आउट टाइम दर्ज करें',

    // ── Settings ─────────────────────────────
    settings_title: 'सेटिंग्स',
    settings_emp_code: 'कर्मचारी कोड',
    settings_phone: 'फ़ोन',
    settings_role: 'भूमिका',
    settings_leave_balance: 'छुट्टी बैलेंस',
    settings_fy: 'वित्त वर्ष',
    settings_used: 'इस्तेमाल',
    settings_change_pw: 'पासवर्ड बदलें',
    settings_new_pw: 'नया पासवर्ड',
    settings_confirm_pw: 'पासवर्ड दोबारा',
    settings_pw_placeholder: 'कम से कम 6 अक्षर',
    settings_pw_confirm_placeholder: 'दोबारा लिखें',
    settings_pw_update: 'पासवर्ड अपडेट करें',
    settings_pw_err_length: 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए',
    settings_pw_err_match: 'पासवर्ड मेल नहीं खाते',
    settings_pw_success: 'पासवर्ड बदल दिया गया',
    settings_admin_link: 'एडमिन डैशबोर्ड',
    settings_admin_hint: 'नई टैब में खुलेगा →',
    settings_signout: 'लॉगआउट',
    settings_notif_title: 'नोटिफिकेशन',
    settings_notif_desc: 'पंच इन-आउट की रिमाइंडर पाएं',
    settings_notif_checking: 'जाँच रहे…',
    settings_notif_off: 'बंद करें',
    settings_notif_enable: 'चालू करें',
    settings_reminders: 'रोज़ाना रिमाइंडर',
    settings_reminder_in: 'पंच इन रिमाइंडर',
    settings_reminder_out: 'पंच आउट रिमाइंडर',
    settings_save_reminders: 'रिमाइंडर सेव करें',
    settings_notif_also: 'क्लेम स्वीकृत या अस्वीकृत होने पर भी आपको सूचना मिलेगी।',
    settings_leave_error: 'छुट्टी बैलेंस में त्रुटि',
    settings_quarterly: 'तिमाही',
    settings_halfday_balance: 'हाफ डे बैलेंस',

    // ── Install Prompt ───────────────────────
    install_title: 'ऐप इंस्टॉल करें',
    install_desc: 'जल्दी एक्सेस के लिए होम स्क्रीन पर जोड़ें',
    install_btn: 'इंस्टॉल',
    install_ios_desc: 'पूरा ऐप अनुभव पाएं',
    install_ios_step1: 'नीचे',
    install_ios_share: 'शेयर',
    install_ios_step1_end: 'बटन दबाएं',
    install_ios_step2: 'नीचे स्क्रॉल करें और दबाएं',
    install_ios_step2_bold: 'Add to Home Screen',
    install_ios_step3: 'ऊपर दाएं',
    install_ios_step3_bold: 'Add',
    install_ios_step3_end: 'दबाएं',
    install_ios_other: 'इस पेज को',
    install_ios_safari: 'Safari',
    install_ios_other_end: 'में खोलें। शेयर आइकन दबाएं, फिर "Add to Home Screen" चुनें।',

    dar_title: 'दैनिक गतिविधि रिपोर्ट',
    dar_date: 'DAR तारीख',
    dar_punch_in: 'पंच इन',
    dar_punch_out: 'पंच आउट',
    dar_punch_auto: 'हाज़िरी से स्वतः लिया गया',
    dar_punch_manual: 'कोई पंच रिकॉर्ड नहीं — मैन्युअल दर्ज करें',
    dar_tasks: 'कार्य',
    dar_tasks_placeholder: 'जैसे: वेंडर से इवेंट सेटअप के लिए समन्वय किया\nचल रहे विज्ञापनों की जाँच की\nटीम के साथ वर्कफ़्लो पर चर्चा की',
    dar_submit: 'DAR जमा करें',
    dar_confirm_title: 'जमा करने की पुष्टि',
    dar_confirm_msg: 'एक बार जमा होने के बाद DAR में बदलाव नहीं होगा। क्या आप सुनिश्चित हैं?',
    dar_confirm_final: 'अंतिम पुष्टि',
    dar_confirm_final_msg: 'कृपया आखिरी बार जाँच लें। यह कार्रवाई स्थायी है।',
    dar_confirm_yes: 'हाँ, जमा करें',
    dar_confirm_back: 'वापस जाएँ और संपादित करें',
    dar_submitted: 'DAR सफलतापूर्वक जमा हुआ',
    dar_exists: 'इस तारीख के लिए DAR पहले से जमा है',
    dar_history: 'पिछले DAR',
    dar_no_history: 'अभी तक कोई DAR जमा नहीं',
    dar_err_tasks: 'कृपया अपने कार्य दर्ज करें',
    dar_err_punchin: 'कृपया पंच-इन समय दर्ज करें',
    dar_preview: 'DAR पूर्वावलोकन',
  }
}

var LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  var [lang, setLang] = useState(function () {
    return localStorage.getItem('ambria-lang') || 'en'
  })

  var switchLang = useCallback(function (newLang) {
    setLang(newLang)
    localStorage.setItem('ambria-lang', newLang)
  }, [])

  var t = useCallback(function (key, params) {
    var str = (translations[lang] && translations[lang][key]) || translations.en[key] || key
    if (params) {
      Object.keys(params).forEach(function (k) {
        str = str.replace('{' + k + '}', params[k])
      })
    }
    return str
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang: lang, setLang: switchLang, t: t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageToggle() {
  var { lang, setLang } = useLanguage()
  return (
    <button
      onClick={function () { setLang(lang === 'en' ? 'hi' : 'en') }}
      className="px-2 py-1 text-[10px] font-bold rounded-md bg-white/15 hover:bg-white/25 transition-colors text-white tracking-wide"
    >
      {lang === 'en' ? 'हिंदी' : 'ENG'}
    </button>
  )
}