import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plane,
  Ship,
  Search,
  Package,
  PlusCircle,
  Clock,
  User,
  LogIn,
  LogOut,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Printer,
  Share2,
  Calendar,
  Box,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Building2,
  ArrowRight,
  Calculator,
  Copy,
  Check,
  Plus,
  Sparkles,
  ChevronRight,
  Menu,
  X,
  RefreshCw,
  ExternalLink,
  Lock,
  Layers,
  FileText,
  DollarSign,
  TrendingUp,
  Sliders,
  Send
} from 'lucide-react';

// ==========================================
// 1. SUPABASE REALTIME CLIENT SETUP
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Configure these in the deployment environment.');
}

export const supabase = createClient(supabaseUrl || 'https://missing-project.supabase.co', supabaseAnonKey || 'missing-publishable-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ==========================================
// 2. CONSTANTS & RATES CONFIGURATION
// ==========================================
const FREIGHT_RATES = {
  airFreightPerKg: 23,  // 23 SAR / kg
  seaFreightPerKg: 13,  // 13 SAR / kg
  handlingFee: 25,      // 25 SAR intake and export doc fee
  insuranceRate: 0.02,  // 2% of declared value
};

const EXCHANGE_RATES = {
  SAR_TO_USD: 0.267,
  SAR_TO_UGX: 1015,
  SAR_TO_KES: 34.8,
  SAR_TO_TZS: 710,
  SAR_TO_RWF: 365,
};

const STATUS_STEPS = [
  'Booking Created',
  'Picked',
  'Received at KSA Hub',
  'Customs Cleared (KSA ZATCA)',
  'In Transit',
  'Arrived at Destination Port/Airport',
  'Customs Cleared (East Africa)',
  'Out for Delivery / Ready for Pickup',
  'Delivered',
];

// ==========================================
// 3. REACTIVE REALTIME SHIPMENTS HOOK
// ==========================================
export function useRealtimeShipments(userId, onSyncNotify) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Keep the latest notify callback without resubscribing the channel
  const notifyRef = useRef(onSyncNotify);
  useEffect(() => {
    notifyRef.current = onSyncNotify;
  }, [onSyncNotify]);

  // Row Level Security limits shipment reads to authorized admins; the schema has no user_id column.
  const fetchRemote = useCallback(async () => {
    if (!userId) {
      setShipments([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[Supabase] Could not load shipments:', error.message);
      } else {
        setShipments(data ?? []);
      }
    } catch (error) {
      console.warn('[Supabase] Unexpected shipment fetch failure:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRemote();
    if (!userId) {
      setIsLiveConnected(false);
      return undefined;
    }

    const channel = supabase
      .channel(`shipments-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shipments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setShipments((prev) =>
              prev.some((s) => s.id === payload.new.id) ? prev : [payload.new, ...prev]
            );
            notifyRef.current?.(`New shipment ${payload.new.tracking_id} synchronized!`);
          } else if (payload.eventType === 'UPDATE') {
            setShipments((prev) => prev.map((s) => (s.id === payload.new.id ? payload.new : s)));
            notifyRef.current?.(`Shipment ${payload.new.tracking_id} moved to: ${payload.new.current_status}`);
          } else if (payload.eventType === 'DELETE') {
            setShipments((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => setIsLiveConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchRemote]);

  return { shipments, setShipments, loading, isLiveConnected, refetch: fetchRemote };
}

// ==========================================
// 4. MAIN APP CONTAINER
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('tracking');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferredView, setPreferredView] = useState('desktop');
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  }, []);

  // Authentication state (Supabase Auth)
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const uid = session?.user?.id;

  // Real-time Supabase hook (only loads data once signed in)
  const { shipments, setShipments, loading: shipmentsLoading, isLiveConnected, refetch } = useRealtimeShipments(uid, showToast);

  // Track search state
  const [trackingSearchId, setTrackingSearchId] = useState('');

  // Modal States
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login'); // 'login' | 'register' | 'forgot' | 'recover'
  const [selectedWaybillShipment, setSelectedWaybillShipment] = useState(null);

  // One-time cleanup of data the previous version left in the browser
  useEffect(() => {
    try {
      ['nyago_users_db_v3', 'nyago_current_session_v3', 'nyago_client_shipments_v3'].forEach((k) =>
        localStorage.removeItem(k)
      );
    } catch (e) {
      /* storage unavailable */
    }
  }, []);

  // Keep the Supabase session in React state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthModalTab('recover');
        setAuthModalOpen(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load the profile row whenever the signed-in user changes
  useEffect(() => {
    if (!uid) {
      setCurrentUser(null);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[Supabase] Could not load profile:', error.message);
          return;
        }
        setCurrentUser({
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          country: data.country,
          city: data.city || '',
          idNumber: data.id_number || undefined,
          accountType: data.account_type,
          businessName: data.business_name || undefined,
          savedContacts: data.saved_contacts || [],
          createdAt: data.created_at,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Auth Functions
  const handleLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      return {
        success: false,
        error: /not confirmed/i.test(error.message)
          ? 'Please confirm your email address first. Check your inbox.'
          : 'Incorrect email or password.',
      };
    }
    setAuthModalOpen(false);
    showToast('Signed in successfully.');
    return { success: true };
  };

  const handleRegister = async (d) => {
    const { data, error } = await supabase.auth.signUp({
      email: d.email.trim().toLowerCase(),
      password: d.password,
      options: {
        data: {
          name: d.name.trim(),
          phone: d.phone.trim(),
          country: d.country,
          city: d.city.trim(),
          id_number: d.idNumber?.trim() || '',
          account_type: d.accountType,
          business_name: d.accountType === 'Commercial Importer' ? (d.businessName || '').trim() : '',
        },
      },
    });
    if (error) return { success: false, error: error.message };
    setAuthModalOpen(false);
    showToast(
      data.session
        ? `Account registered successfully. Welcome, ${d.name.trim()}!`
        : 'Account created. Check your email to confirm it, then sign in.'
    );
    return { success: true };
  };

  const handleSendResetEmail = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    return error ? { success: false, error: error.message } : { success: true };
  };

  const handleSetNewPassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    setAuthModalOpen(false);
    showToast('Password updated. You are signed in.');
    return { success: true };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveTab('tracking');
    setTrackingSearchId('');
    showToast('Signed out of client session.');
  };

  const handleAddSavedContact = async (contact) => {
    if (!currentUser) return;
    const next = [...(currentUser.savedContacts || []), { ...contact, id: `cnt-${crypto.randomUUID()}` }];
    const { error } = await supabase.from('profiles').update({ saved_contacts: next }).eq('id', currentUser.id);
    if (error) {
      showToast('Could not save recipient. Please try again.');
      return;
    }
    setCurrentUser({ ...currentUser, savedContacts: next });
    showToast(`Saved ${contact.name} to frequent recipients!`);
  };

  const handleUpdateProfile = async (profileData) => {
    if (!currentUser) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        phone: profileData.phone,
        city: profileData.city,
        id_number: profileData.idNumber || null,
        business_name: profileData.businessName || null,
      })
      .eq('id', currentUser.id);
    if (error) {
      showToast('Could not update profile. Please try again.');
      return;
    }
    setCurrentUser({ ...currentUser, ...profileData });
    showToast('Profile information updated.');
  };

  // A booking is created on the server; add it to local state right away
  const handleBookingCreated = (createdShipment) => {
    setShipments((prev) =>
      prev.some((s) => s.id === createdShipment.id) ? prev : [createdShipment, ...prev]
    );
    setTrackingSearchId(createdShipment.tracking_id);
    setSelectedWaybillShipment(createdShipment);
    showToast(`Booking ${createdShipment.tracking_id} created and synced!`);
  };

  const handleNavigateToTrack = (id) => {
    setTrackingSearchId(id);
    setActiveTab('tracking');
  };

  return (
    <div
      className={`app-root view-${preferredView} min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-slate-950 ${
        selectedWaybillShipment ? 'waybill-open' : ''
      }`}
    >
      <style>{`
        @media print {
          @page { margin: 10mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body, .app-root { background: #fff !important; min-height: 0 !important; }
          .no-print { display: none !important; }
          .app-root.waybill-open .app-chrome { display: none !important; }
          .waybill-wrap { position: static !important; display: block !important; padding: 0 !important; background: #fff !important; backdrop-filter: none !important; }
          .waybill-box { max-height: none !important; max-width: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
        }

        /* Full-width layout: desktop-style navigation remains available on phones */
        html, body, #root { width: 100%; min-width: 0; margin: 0; }
        .app-root {
          display: flex !important; flex-direction: column !important;
          width: 100% !important; min-width: 0 !important; max-width: none !important;
          min-height: 100vh; margin: 0 !important; overflow-x: hidden;
          align-items: stretch !important; box-sizing: border-box;
        }
        .app-root *, .app-root *::before, .app-root *::after { box-sizing: border-box; }
        .app-root > .app-chrome { min-width: 0; }
        .app-root > header.app-chrome > div.max-w-7xl {
          display: flex; width: 100%; max-width: 1500px; min-width: 0;
          margin-left: auto; margin-right: auto; gap: 10px;
          padding-left: 12px; padding-right: 12px;
        }
        .app-root.view-desktop > header.app-chrome nav {
          display: flex !important; position: static !important; flex-direction: row !important;
          align-items: center; flex: 1 1 0%; width: 0; min-width: 0; max-width: 100%;
          max-height: none; overflow-x: auto; overflow-y: hidden; white-space: nowrap;
          padding: 5px; gap: 3px;
        }
        .app-root.view-desktop > header.app-chrome nav button {
          flex: 0 0 auto; white-space: nowrap; padding-left: 9px; padding-right: 9px;
        }
        .app-root.view-desktop > header.app-chrome > div.max-w-7xl > div.md\:hidden { display: none !important; }
        .app-root.view-desktop > main.app-chrome {
          display: block; width: 100% !important; max-width: 1500px !important;
          min-width: 0; margin-left: auto !important; margin-right: auto !important;
          padding: 22px clamp(12px, 2vw, 30px) !important;
        }
        .app-root > section.app-chrome { width: 100% !important; max-width: 1500px !important; min-width: 0; }
        .app-root > footer.app-chrome { width: 100% !important; max-width: none !important; margin-left: 0 !important; }
        .app-root.view-mobile > header.app-chrome nav { display: none !important; }
        .app-root.view-mobile > header.app-chrome > div.max-w-7xl > div.md\:hidden { display: flex !important; }
        .app-root.view-mobile > main.app-chrome { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 18px 12px !important; }
        .app-root { background: #1f1f1f !important; color: #f5f5f5 !important; }
        .app-root .bg-slate-950 { background-color: #1f1f1f !important; }
        .app-root .bg-slate-900 { background-color: #292929 !important; }
        .app-root .border-slate-800 { border-color: #383838 !important; }
        .app-root .text-amber-400, .app-root .text-amber-500 { color: #f2c14e !important; }
        .app-root .bg-amber-500 { background-color: #f2c14e !important; color: #252525 !important; }
        .app-root .hover\:bg-amber-400:hover { background-color: #ffd56b !important; }
        .app-root .rounded-3xl, .app-root .rounded-2xl { border-radius: 12px !important; }
        /* Small screens still show the full desktop navigation when Desktop View is selected. */
        @media (max-width: 767px) {
          .app-root.view-desktop > header.app-chrome > div.max-w-7xl {
            height: auto !important;
            min-height: 80px;
            flex-wrap: wrap !important;
            justify-content: space-between;
            gap: 10px !important;
            padding: 12px !important;
          }
          .app-root.view-desktop > header.app-chrome nav {
            display: flex !important;
            order: 10;
            flex: 1 0 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            justify-content: flex-start;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
          .app-root.view-desktop > header.app-chrome nav button {
            flex: 0 0 auto;
            white-space: nowrap;
            padding: 8px 10px;
            font-size: 11px;
          }
          .app-root.view-desktop > main.app-chrome {
            width: 100% !important;
            max-width: none !important;
            margin-left: auto !important;
            margin-right: auto !important;
            padding: 18px 12px !important;
          }
          .app-root.view-desktop > footer.app-chrome { margin-left: 0 !important; width: 100% !important; }
          .app-root.view-mobile > header.app-chrome nav { display: none !important; }
          .app-root.view-mobile > main.app-chrome {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            padding: 18px 12px !important;
          }
          .app-root.view-mobile > footer.app-chrome { margin-left: 0 !important; width: 100% !important; }
        }
        .app-root, .app-root > header, .app-root > main, .app-root > footer {
          box-sizing: border-box;
          min-width: 0;
        }
        .app-root > header.app-chrome, .app-root > main.app-chrome, .app-root > footer.app-chrome {
          width: 100%;
        }
      `}</style>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="app-chrome fixed top-4 right-4 z-50 flex items-center gap-2 bg-slate-900 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-2xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP REGIONAL HOTLINE & STATUS BAR */}
      <div className="app-chrome bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 py-1.5 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <Phone className="w-3 h-3" />
              KSA Desk: <span className="font-mono text-white">+966 57 066 4167</span>
            </span>
            <span className="hidden md:inline text-slate-600">&bull;</span>
            <span className="hidden md:flex items-center gap-1.5 text-sky-400 font-semibold">
              <Phone className="w-3 h-3" />
              Uganda Hub: <span className="font-mono text-white">+256 706 305 303</span>
            </span>
            <span className="hidden lg:inline text-slate-600">&bull;</span>
            <span className="hidden lg:flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isLiveConnected ? 'Supabase Live Sync Active' : 'Connecting Realtime...'}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-300">
            <span className="flex items-center gap-1">
              <Plane className="w-3 h-3 text-amber-400" /> Air: <strong>23 SAR/kg</strong> (3-5d)
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <Ship className="w-3 h-3 text-sky-400" /> Sea: <strong>13 SAR/kg</strong> (25-35d)
            </span>
          </div>
        </div>
      </div>

      {/* CLIENT HEADER NAVBAR */}
      <header className="app-chrome sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-6">
          <button
            onClick={() => setActiveTab('tracking')}
            className="flex items-center gap-3 text-left focus:outline-none group shrink-0"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-amber-500/20 group-hover:scale-102 transition-transform">
              <Ship className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xl font-black text-white tracking-tight leading-none group-hover:text-amber-400 transition-colors">
                NYAGO CARGO
              </div>
              <div className="text-xs text-slate-400 font-medium tracking-wide mt-1">
                Saudi Arabia &bull; East Africa Express
              </div>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('tracking')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'tracking'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Search className="w-4 h-4" />
              Live Tracking
            </button>
            <button
              onClick={() => setActiveTab('booking')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'booking'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Book Cargo
            </button>
            <button
              onClick={() => setActiveTab('rates')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'rates'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calculator className="w-4 h-4" />
              Rates &amp; Schedule
            </button>
            <button
              onClick={() => setActiveTab('my-shipments')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'my-shipments'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-4 h-4" />
              My Shipments
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-400">
                {shipments.length}
              </span>
            </button>
            {currentUser && (
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'profile'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <User className="w-4 h-4 text-amber-400" />
                Shipper Account
              </button>
            )}
          </nav>

          {/* User Auth Section */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveTab('profile')}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs shadow-md">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white leading-tight max-w-[130px] truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono leading-none mt-0.5">
                      {currentUser.city}, KSA
                    </div>
                  </div>
                </button>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAuthModalTab('login');
                    setAuthModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthModalTab('register');
                    setAuthModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 active:scale-98 rounded-xl shadow-md transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Register Shipper
                </button>
              </div>
            )}
          </div>

          {/* Desktop / Mobile View Switch */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1 shrink-0">
            <button type="button" onClick={() => { setPreferredView('desktop'); setMobileMenuOpen(false); }} aria-pressed={preferredView === 'desktop'} className={`px-2 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg ${preferredView === 'desktop' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'}`}>Desktop View</button>
            <button type="button" onClick={() => { setPreferredView('mobile'); setMobileMenuOpen(false); }} aria-pressed={preferredView === 'mobile'} className={`px-2 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg ${preferredView === 'mobile' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'}`}>Mobile View</button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className={`${preferredView === 'mobile' ? 'flex' : 'hidden'} md:hidden items-center gap-2`}>
            {!currentUser && (
              <button
                onClick={() => {
                  setAuthModalTab('login');
                  setAuthModalOpen(true);
                }}
                className="px-2.5 py-1.5 text-xs font-bold bg-amber-500 text-slate-950 rounded-lg"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-400 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {preferredView === 'mobile' && mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-5 space-y-2 text-xs">
            <button
              onClick={() => {
                setActiveTab('tracking');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold ${
                activeTab === 'tracking' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              <Search className="w-4 h-4" /> Live Tracking
            </button>
            <button
              onClick={() => {
                setActiveTab('booking');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold ${
                activeTab === 'booking' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              <PlusCircle className="w-4 h-4" /> Book Consignment
            </button>
            <button
              onClick={() => {
                setActiveTab('rates');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold ${
                activeTab === 'rates' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              <Calculator className="w-4 h-4" /> Freight Rates &amp; Schedules
            </button>
            <button
              onClick={() => {
                setActiveTab('my-shipments');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold ${
                activeTab === 'my-shipments' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              <Clock className="w-4 h-4" /> My Consignments
            </button>
            {currentUser && (
              <button
                onClick={() => {
                  setActiveTab('profile');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold ${
                  activeTab === 'profile' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                <User className="w-4 h-4" /> Shipper Profile &amp; Address Book
              </button>
            )}
            <div className="pt-3 border-t border-slate-800">
              {currentUser ? (
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 text-rose-400 font-bold rounded-lg"
                >
                  <LogOut className="w-4 h-4" /> Sign Out ({currentUser.name})
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAuthModalTab('login');
                    setAuthModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 text-slate-950 font-bold rounded-lg"
                >
                  <LogIn className="w-4 h-4" /> Sign In / Register
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ORIGINAL NYAGO CARGO SHIPPING BANNER */}
      <section className="app-chrome w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5">
        <button type="button" onClick={() => setActiveTab('booking')} className="block w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Book a shipment">
          <img src="/images/nyago-cargo-image.jpg" alt="Nyago Cargo shipping services: air freight, sea freight and land transport" className="block w-full h-auto object-contain" loading="eager" />
        </button>
      </section>

      {/* MAIN VIEWPORT */}
      <main className="app-chrome flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'tracking' && (
          <TrackingPortalView
            shipments={shipments}
            initialTrackingId={trackingSearchId}
            onOpenWaybill={(s) => setSelectedWaybillShipment(s)}
            onNavigateToBooking={() => setActiveTab('booking')}
            onRefresh={refetch}
            isLiveConnected={isLiveConnected}
          />
        )}

        {activeTab === 'booking' && (
          <BookingConsignmentView
            currentUser={currentUser}
            onOpenAuth={() => {
              setAuthModalTab('login');
              setAuthModalOpen(true);
            }}
            onBookingCreated={(newShipment) => {
              handleBookingCreated(newShipment);
              setActiveTab('tracking');
            }}
            onOpenWaybill={(s) => setSelectedWaybillShipment(s)}
          />
        )}

        {activeTab === 'rates' && (
          <RatesAndSchedulesView onNavigateToBooking={() => setActiveTab('booking')} />
        )}

        {activeTab === 'my-shipments' && (
          <ClientShipmentsListView
            currentUser={currentUser}
            onOpenAuth={() => {
              setAuthModalTab('login');
              setAuthModalOpen(true);
            }}
            shipments={shipments}
            onSelectToTrack={handleNavigateToTrack}
            onOpenWaybill={(s) => setSelectedWaybillShipment(s)}
            onNavigateToBooking={() => setActiveTab('booking')}
          />
        )}

        {activeTab === 'profile' && currentUser && (
          <UserProfileAndAddressBookView
            user={currentUser}
            shipments={shipments}
            onUpdateProfile={handleUpdateProfile}
            onAddContact={handleAddSavedContact}
            onNavigateToBooking={() => setActiveTab('booking')}
            onSelectToTrack={handleNavigateToTrack}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* FOOTER */}
      <footer className="app-chrome no-print bg-slate-900 border-t border-slate-800 mt-20 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white font-black text-base">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center">
                  <Ship className="w-4 h-4" />
                </div>
                NYAGO CARGO EXPRESS
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Direct express air cargo and sea freight forwarding gateway connecting the Kingdom of Saudi Arabia directly to Uganda, Kenya, and East Africa with scheduled weekly departures.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Licensed Consolidator &bull; ZATCA Export Compliant
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-white font-bold text-xs uppercase tracking-wider">Services</div>
              <ul className="space-y-1.5 text-slate-400">
                <li>Direct Air Cargo Express (23 SAR / kg)</li>
                <li>Consolidated Ocean Freight (13 SAR / kg)</li>
                <li>Commercial Electronics &amp; Spare Motors</li>
                <li>Personal Effects &amp; Abaya Wardrobes</li>
                <li>Bonded Customs Clearance (EBB / NBO)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-white font-bold text-xs uppercase tracking-wider">Intake Hubs</div>
              <ul className="space-y-1.5 text-slate-400">
                <li>Riyadh Central Hub (Batha / Sulaymaniyah)</li>
                <li>Jeddah Islamic Port CFS &amp; Al Balad</li>
                <li>Dammam Al Khobar Staging Depot</li>
                <li>Kampala Nakasero Central Hub (Uganda)</li>
                <li>Nairobi Eastleigh Terminal (Kenya)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-white font-bold text-xs uppercase tracking-wider">Customer Care</div>
              <div className="space-y-2 text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-mono text-white">+966 57 066 4167</span> (KSA)
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-mono text-white">+256 706 305 303</span> (East Africa)
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>support@nyagocargo.com</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div>&copy; 2026 Nyago Cargo &amp; Logistics. All rights reserved.</div>
            <div className="flex items-center gap-4">
              <span>Saudi Arabia (RUH/JED/DMM)</span>
              <span>&rarr;</span>
              <span>East Africa (EBB/NBO/MBA)</span>
            </div>
          </div>
        </div>
      </footer>

      {/* AUTHENTICATION & PASSWORD MODAL */}
      {authModalOpen && (
        <AuthModal
          tab={authModalTab}
          setTab={setAuthModalTab}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onSendResetEmail={handleSendResetEmail}
          onSetNewPassword={handleSetNewPassword}
          onClose={() => setAuthModalOpen(false)}
        />
      )}

      {/* OFFICIAL AIR WAYBILL / BOL MODAL */}
      {selectedWaybillShipment && (
        <OfficialWaybillModal
          shipment={selectedWaybillShipment}
          onClose={() => setSelectedWaybillShipment(null)}
        />
      )}
    </div>
  );
}

// ==========================================
// 5. AUTHENTICATION & PASSWORD MODAL
// ==========================================
function AuthModal({ tab, setTab, onLogin, onRegister, onSendResetEmail, onSetNewPassword, onClose }) {
  const [errorMsg, setErrorMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Login Form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register Form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhone, setRegPhone] = useState('+966 ');
  const [regCountry, setRegCountry] = useState('Saudi Arabia');
  const [regCity, setRegCity] = useState('Riyadh');
  const [regIdNumber, setRegIdNumber] = useState('');
  const [regAccountType, setRegAccountType] = useState('Personal Shipper');
  const [regBusinessName, setRegBusinessName] = useState('');

  // Password reset (email link) and new-password forms
  const [forgotEmail, setForgotEmail] = useState('');
  const [showForgotSuccess, setShowForgotSuccess] = useState(false);
  const [recoverPassword, setRecoverPassword] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const res = await onLogin(loginEmail, loginPassword);
    setBusy(false);
    if (!res.success) setErrorMsg(res.error);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (regPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    setBusy(true);
    const res = await onRegister({
      name: regName,
      email: regEmail,
      password: regPassword,
      phone: regPhone,
      country: regCountry,
      city: regCity,
      idNumber: regIdNumber,
      accountType: regAccountType,
      businessName: regBusinessName,
    });
    setBusy(false);
    if (!res.success) setErrorMsg(res.error);
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const res = await onSendResetEmail(forgotEmail);
    setBusy(false);
    if (res.success) setShowForgotSuccess(true);
    else setErrorMsg(res.error);
  };

  const handleRecoverSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (recoverPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    setBusy(true);
    const res = await onSetNewPassword(recoverPassword);
    setBusy(false);
    if (!res.success) setErrorMsg(res.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">
              {tab === 'login' && 'Shipper Sign In'}
              {tab === 'register' && 'Register Shipper Account'}
              {tab === 'forgot' && 'Reset Shipper Password'}
              {tab === 'recover' && 'Choose a New Password'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Secure client portal for Saudi Arabia &bull; East Africa cargo tracking and booking.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tab !== 'recover' && (
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`py-2 text-center rounded-lg transition-all ${
              tab === 'login' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In with Password
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`py-2 text-center rounded-lg transition-all ${
              tab === 'register' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Email Address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-medium">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setTab('forgot');
                    setForgotEmail(loginEmail);
                    setErrorMsg(null);
                  }}
                  className="text-amber-400 hover:underline text-[11px]"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 active:scale-98 text-slate-950 font-black py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Shipper Portal
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 uppercase text-[11px] tracking-wider">
                Select Shipper Profile
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRegAccountType('Personal Shipper')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    regAccountType === 'Personal Shipper'
                      ? 'bg-amber-500/10 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Personal Shipper</div>
                    <div className="text-[10px] text-slate-400">Parcels, clothes &amp; gifts</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRegAccountType('Commercial Importer')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    regAccountType === 'Commercial Importer'
                      ? 'bg-amber-500/10 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Commercial Trader</div>
                    <div className="text-[10px] text-slate-400">Machinery &amp; wholesale</div>
                  </div>
                </button>
              </div>
            </div>

            {regAccountType === 'Commercial Importer' && (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Registered Business Name <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regBusinessName}
                  onChange={(e) => setRegBusinessName(e.target.value)}
                  placeholder="e.g. Mukasa Electronics Ltd"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Full Name <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Ismail Mukasa"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Email Address <span className="text-amber-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Password <span className="text-amber-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-9 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Phone (Saudi Arabia) <span className="text-amber-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Origin City (KSA)</label>
                <select
                  value={regCity}
                  onChange={(e) => setRegCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Riyadh">Riyadh (Batha / Sulaymaniyah)</option>
                  <option value="Jeddah">Jeddah (Al Balad / Port)</option>
                  <option value="Dammam">Dammam / Al Khobar</option>
                  <option value="Mecca">Mecca</option>
                  <option value="Medina">Medina</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Iqama / Saudi ID (Optional)
                </label>
                <input
                  type="text"
                  value={regIdNumber}
                  onChange={(e) => setRegIdNumber(e.target.value)}
                  placeholder="10-digit ID for ZATCA"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 active:scale-98 text-slate-950 font-black py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              Complete Shipper Registration
            </button>
          </form>
        )}

        {tab === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4 text-xs">
            {showForgotSuccess ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>If that email has an account, a password reset link is on its way. Check your inbox.</span>
              </div>
            ) : (
              <div>
                <label className="block text-slate-300 font-medium mb-1">Registered Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForgotSuccess(false);
                  setTab('login');
                }}
                className="text-slate-400 hover:text-white"
              >
                &larr; Back to Sign In
              </button>
              {!showForgotSuccess && (
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black py-2.5 px-5 rounded-xl transition-all"
                >
                  Send Reset Link
                </button>
              )}
            </div>
          </form>
        )}

        {tab === 'recover' && (
          <form onSubmit={handleRecoverSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={recoverPassword}
                onChange={(e) => setRecoverPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black py-3 rounded-xl text-sm transition-all"
            >
              Update Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 6. LIVE CARGO TRACKING VIEW
// ==========================================
function TrackingPortalView({ shipments, initialTrackingId, onOpenWaybill, onNavigateToBooking, onRefresh, isLiveConnected }) {
  const [searchInput, setSearchInput] = useState(initialTrackingId);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Searching: owners get the full record; anyone else gets status only (via RPC)
  const performSearch = useCallback(
    async (query) => {
      setHasSearched(true);
      const clean = query.trim().toUpperCase();
      if (!clean) return;

      const own = shipments.find((s) => s.tracking_id?.toUpperCase() === clean);
      if (own) {
        setSelectedShipment(own);
        return;
      }

      const { data, error } = await supabase.rpc('track_shipment', { p_tracking_id: clean });
      // Postgres TABLE-returning RPCs return an array; normalize the first row before rendering.
      const trackedShipment = Array.isArray(data) ? data[0] : data;
      setSelectedShipment(!error && trackedShipment ? { ...trackedShipment, restricted: true } : null);
    },
    [shipments]
  );

  // Run the search when a tracking ID is passed in (e.g. right after a booking)
  useEffect(() => {
    if (initialTrackingId) {
      setSearchInput(initialTrackingId);
      performSearch(initialTrackingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrackingId]);

  // Keep an owned shipment fresh on realtime updates without re-running the search
  useEffect(() => {
    setSelectedShipment((prev) =>
      prev && !prev.restricted ? shipments.find((s) => s.id === prev.id) ?? prev : prev
    );
  }, [shipments]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    performSearch(searchInput);
  };

  const getStepProgressIndex = (status) => {
    switch (status) {
      case 'Booking Created': return 0;
      case 'Picked': return 1;
      case 'Received at KSA Hub': return 2;
      case 'Customs Cleared (KSA ZATCA)': return 3;
      case 'In Transit': return 4;
      case 'Arrived at Destination Port/Airport': return 5;
      case 'Customs Cleared (East Africa)': return 6;
      case 'Out for Delivery / Ready for Pickup': return 7;
      case 'Delivered': return 8;
      default: return 0;
    }
  };

  const currentStepIndex = selectedShipment ? getStepProgressIndex(selectedShipment.current_status) : 0;

  const displayMilestones = [
    { title: 'Intake & Hub', desc: 'Received at KSA Depot', stepThreshold: 1 },
    { title: 'Customs ZATCA', desc: 'Export Clearance (KSA)', stepThreshold: 2 },
    { title: 'In Transit', desc: 'Air Flight / Sea Vessel', stepThreshold: 3 },
    { title: 'East Africa Entry', desc: 'Port / Airport Bonded', stepThreshold: 5 },
    { title: 'Delivered', desc: 'Door or Hub Collection', stepThreshold: 7 },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
        <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Live Consignment Status &amp; Checkpoint Tracker
            </label>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-mono text-slate-400">{isLiveConnected ? 'Live' : 'Cached'}</span>
              <button
                type="button"
                onClick={onRefresh}
                title="Refresh tracking data"
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-700 focus-within:border-amber-500 rounded-2xl p-1.5 flex flex-col sm:flex-row gap-2 shadow-inner transition-all">
            <div className="relative flex-grow flex items-center pl-3">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Enter Tracking ID (e.g. NYG-3F9A1C2B)"
                className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs transition-all shadow-md"
            >
              Track Cargo
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 pt-2">
            {shipments.length > 0 && <span className="text-slate-500">Your recent shipments:</span>}
            {shipments.slice(0, 4).map((s) => (
              <button
                key={s.id || s.tracking_id}
                type="button"
                onClick={() => {
                  setSearchInput(s.tracking_id);
                  performSearch(s.tracking_id);
                }}
                className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  selectedShipment?.tracking_id === s.tracking_id
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {s.tracking_id} ({s.cargo_type === 'Air Freight' ? 'Air' : 'Sea'})
              </button>
            ))}
          </div>
        </form>
      </div>

      {selectedShipment ? (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                  <span className="font-mono text-amber-400 font-black text-sm tracking-wide">
                    {selectedShipment.tracking_id}
                  </span>
                  <span>&middot;</span>
                  <span className="flex items-center gap-1 font-semibold text-slate-200">
                    {selectedShipment.cargo_type === 'Air Freight' ? (
                      <Plane className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Ship className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    {selectedShipment.cargo_type}
                  </span>
                  <span>&middot;</span>
                  <span className="text-slate-400">
                    Booked {(() => {
                    const bookedAt = selectedShipment.created_at ?? selectedShipment.createdAt ?? selectedShipment.booking_date;
                    if (!bookedAt) return 'Date unavailable';
                    const bookedDate = new Date(bookedAt);
                    return Number.isNaN(bookedDate.getTime())
                      ? 'Date unavailable'
                      : bookedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                  })()}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {selectedShipment.current_status}
                </h2>
              </div>
              {!selectedShipment.restricted && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenWaybill(selectedShipment)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-700 transition-colors"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  Print Waybill (AWB / BOL)
                </button>
              </div>
              )}
            </div>

            {/* Visual Corridor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Origin (Saudi Arabia)</div>
                  <div className="text-sm font-bold text-white">{selectedShipment.sender_city} Hub</div>
                  <div className="text-xs text-slate-400 mt-0.5">{selectedShipment.sender_name}</div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-2 px-4 border-y md:border-y-0 md:border-x border-slate-800 text-center">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1 font-medium">
                  {selectedShipment.cargo_type === 'Air Freight' ? (
                    <>
                      <Plane className="w-3.5 h-3.5 text-amber-400" /> Direct Air Corridor
                    </>
                  ) : (
                    <>
                      <Ship className="w-3.5 h-3.5 text-sky-400" /> Red Sea / Indian Ocean Lane
                    </>
                  )}
                </div>
                <div className="w-full max-w-[200px] h-1.5 bg-slate-800 rounded-full overflow-hidden my-1 relative">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-sky-400 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(15, (currentStepIndex / 7) * 100))}%`,
                    }}
                  />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Target Delivery: {selectedShipment.estimated_delivery}
                </div>
              </div>

              <div className="flex items-start gap-3 md:justify-end text-left md:text-right">
                <div className="order-2 md:order-1">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">
                    Destination ({selectedShipment.receiver_country})
                  </div>
                  <div className="text-sm font-bold text-white">{selectedShipment.receiver_city}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{selectedShipment.receiver_name}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 order-1 md:order-2">
                  <MapPin className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 5-Step Progress */}
            <div className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {displayMilestones.map((milestone, idx) => {
                  const isCompleted = currentStepIndex >= milestone.stepThreshold;
                  const isCurrent =
                    currentStepIndex === milestone.stepThreshold ||
                    (idx === 0 && currentStepIndex === 0) ||
                    (idx === 4 && currentStepIndex === 7);
                  return (
                    <div
                      key={milestone.title}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : isCompleted
                          ? 'bg-slate-950/80 border-slate-800 text-slate-300'
                          : 'bg-slate-950/30 border-slate-900 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                              isCurrent
                                ? 'border-amber-400 text-amber-400 font-bold'
                                : 'border-slate-700 text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </div>
                        )}
                        <span className="text-xs font-bold truncate">{milestone.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{milestone.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Movement Audit Checkpoints */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Cargo Movement Audit Checkpoints
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedShipment.events?.length || 0} events logged
                </span>
              </div>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {selectedShipment.events?.map((evt, idx) => (
                  <div key={evt.id || idx} className="relative group">
                    <div
                      className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-slate-950 ${
                        idx === 0
                          ? 'border-amber-500 bg-amber-500 ring-4 ring-amber-500/20'
                          : 'border-slate-600'
                      }`}
                    />
                    <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2 hover:border-slate-700 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="text-xs font-bold text-white tracking-wide">
                          {evt.status}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {new Date(evt.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-amber-400/90 font-medium">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{evt.location}</span>
                      </div>
                      {evt.notes && <p className="text-xs text-slate-300 leading-relaxed">{evt.notes}</p>}
                      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        {evt.carrierRef && (
                          <span className="font-mono text-sky-400 font-medium">
                            Carrier: {evt.carrierRef}
                          </span>
                        )}
                        {evt.updatedBy && <span>Handled by: {evt.updatedBy}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Consignment Particulars & Recipient */}
            {!selectedShipment.restricted && (
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-400" />
                    Consignment Manifest
                  </h3>
                  <span className="text-xs font-mono text-amber-400 font-bold">
                    {selectedShipment.cargo_type}
                  </span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Total Gross Weight:</span>
                    <span className="font-mono tabular-nums text-white font-bold">
                      {selectedShipment.weight_kg} kg
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Packaging Type:</span>
                    <span className="text-white font-medium">{selectedShipment.package_type}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Piece Count:</span>
                    <span className="font-mono text-white font-medium">
                      {selectedShipment.package_count} package(s)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Declared Goods:</span>
                    <span className="text-white font-medium text-right max-w-[200px] truncate">
                      {selectedShipment.goods_description}
                    </span>
                  </div>
                  {selectedShipment.declared_value_sar !== undefined && (
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Declared Value:</span>
                      <span className="font-mono tabular-nums text-white">
                        {selectedShipment.declared_value_sar} SAR
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Shipping Rate:</span>
                    <span className="font-mono tabular-nums text-white">
                      {selectedShipment.rate_per_kg} SAR / kg
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Total Billed:</span>
                    <span className="font-mono tabular-nums font-black text-amber-400">
                      {Number(selectedShipment.total_cost_sar || 0).toFixed(2)} SAR ({selectedShipment.payment_status})
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-400" />
                  Routing Parties &amp; Recipient
                </h3>
                <div className="space-y-3.5 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Consignor (KSA)</div>
                    <div className="font-bold text-white mt-0.5">{selectedShipment.sender_name}</div>
                    <div className="font-mono text-slate-400 mt-0.5">{selectedShipment.sender_phone}</div>
                    <div className="text-slate-400">{selectedShipment.sender_city}, Saudi Arabia</div>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Consignee ({selectedShipment.receiver_country})
                    </div>
                    <div className="font-bold text-white mt-0.5">{selectedShipment.receiver_name}</div>
                    <div className="font-mono text-slate-400 mt-0.5">{selectedShipment.receiver_phone}</div>
                    <div className="text-slate-300 mt-1">
                      {selectedShipment.receiver_address}, {selectedShipment.receiver_city},{' '}
                      {selectedShipment.receiver_country}
                    </div>
                  </div>
                </div>
                <div className="pt-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Nyago Cargo Tracking: ${selectedShipment.tracking_id} - Milestone: ${selectedShipment.current_status} to ${selectedShipment.receiver_city}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share Tracking with Consignee (WhatsApp)
                  </a>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      ) : hasSearched ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Consignment Not Found</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            No active shipment matched <span className="font-mono text-amber-400 font-bold">{searchInput}</span>. Please verify your tracking number.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={onNavigateToBooking}
              className="text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 px-4 py-2 rounded-xl"
            >
              Book New Shipment
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ==========================================
// 7. CONSIGNMENT BOOKING VIEW
// ==========================================
function BookingConsignmentView({ currentUser, onOpenAuth, onBookingCreated, onOpenWaybill }) {
  const [senderName, setSenderName] = useState(currentUser?.name || '');
  const [senderPhone, setSenderPhone] = useState(currentUser?.phone || '+966 ');
  const [senderCity, setSenderCity] = useState(currentUser?.city || 'Riyadh');
  const [senderIqama, setSenderIqama] = useState(currentUser?.idNumber || '');

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('+256 ');
  const [receiverCountry, setReceiverCountry] = useState('Uganda');
  const [receiverCity, setReceiverCity] = useState('Kampala');
  const [receiverAddress, setReceiverAddress] = useState('Central Depot (Collection)');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [pickupLatitude, setPickupLatitude] = useState(null);
  const [pickupLongitude, setPickupLongitude] = useState(null);
  const pickupMapElementRef = useRef(null);
  const pickupMapRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const [pickupMapReady, setPickupMapReady] = useState(false);
  const [pickupMapError, setPickupMapError] = useState('');

  // Interactive OpenStreetMap picker. Leaflet is loaded on demand, so no package install is needed.
  useEffect(() => {
    let cancelled = false;
    const loadCss = () => new Promise((resolve) => {
      if (document.querySelector('link[data-nyago-leaflet]')) return resolve();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.dataset.nyagoLeaflet = 'true';
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
    const loadScript = () => new Promise((resolve, reject) => {
      if (window.L) return resolve(window.L);
      const existing = document.querySelector('script[data-nyago-leaflet]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.L), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.dataset.nyagoLeaflet = 'true';
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const reverseGeocode = async (lat, lng) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        if (!response.ok) return;
        const result = await response.json();
        if (result?.display_name) setPickupAddress(result.display_name);
      } catch { /* Coordinates remain usable if address lookup is unavailable. */ }
    };
    const init = async () => {
      try {
        await loadCss();
        const L = await loadScript();
        if (cancelled || !L || !pickupMapElementRef.current || pickupMapRef.current) return;
        const initial = pickupLatitude != null && pickupLongitude != null
          ? [pickupLatitude, pickupLongitude] : [24.7136, 46.6753]; // Riyadh default
        const map = L.map(pickupMapElementRef.current, { scrollWheelZoom: true }).setView(initial, pickupLatitude != null ? 16 : 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        const marker = L.marker(initial, { draggable: true }).addTo(map);
        const applyPoint = (latlng) => {
          setPickupLatitude(latlng.lat);
          setPickupLongitude(latlng.lng);
          marker.setLatLng(latlng);
          reverseGeocode(latlng.lat, latlng.lng);
        };
        map.on('click', (event) => applyPoint(event.latlng));
        marker.on('dragend', () => applyPoint(marker.getLatLng()));
        pickupMapRef.current = map;
        pickupMarkerRef.current = marker;
        setPickupMapReady(true);
        setPickupMapError('');
        setTimeout(() => map.invalidateSize(), 100);
      } catch {
        if (!cancelled) setPickupMapError('The map could not load. Check your internet connection and try again.');
      }
    };
    init();
    return () => { cancelled = true; if (pickupMapRef.current) { pickupMapRef.current.remove(); pickupMapRef.current = null; pickupMarkerRef.current = null; } };
  }, []);

  useEffect(() => {
    if (pickupMapRef.current && pickupLatitude != null && pickupLongitude != null) {
      const point = [pickupLatitude, pickupLongitude];
      pickupMapRef.current.setView(point, Math.max(pickupMapRef.current.getZoom(), 15));
      pickupMarkerRef.current?.setLatLng(point);
    }
  }, [pickupLatitude, pickupLongitude]);

  const useCurrentPickupLocation = () => {
    if (!navigator.geolocation) {
      alert('Location is not supported by this browser. Please choose a point on the map.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setPickupLatitude(lat);
        setPickupLongitude(lng);
        setPickupAddress((current) => current && current !== 'Current GPS location' ? current : '');
        if (pickupMapRef.current) pickupMapRef.current.setView([lat, lng], 16);
      },
      () => alert('Unable to access your location. Allow location permission or select a point on the map.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const [cargoType, setCargoType] = useState('Air Freight');
  const [weightKg, setWeightKg] = useState(12);
  const [packageType, setPackageType] = useState('Carton Box');
  const [packageCount, setPackageCount] = useState(1);
  const [goodsDescription, setGoodsDescription] = useState('');
  const [declaredValueSar, setDeclaredValueSar] = useState(600);
  const [includeInsurance, setIncludeInsurance] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [paymentMethod, setPaymentMethod] = useState('Mada / Card');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [confirmedShipment, setConfirmedShipment] = useState(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  useEffect(() => {
    if (currentUser) {
      if (!senderName) setSenderName(currentUser.name);
      if (!senderPhone || senderPhone === '+966 ') setSenderPhone(currentUser.phone);
      if (currentUser.city) setSenderCity(currentUser.city);
      if (currentUser.idNumber) setSenderIqama(currentUser.idNumber);
    }
  }, [currentUser]);

  const handleSelectSavedContact = (cnt) => {
    setReceiverName(cnt.name);
    setReceiverPhone(cnt.phone);
    setReceiverCountry(cnt.country || 'Uganda');
    setReceiverCity(cnt.city);
    setReceiverAddress(cnt.address);
  };

  const handleCountryChange = (country) => {
    setReceiverCountry(country);
    if (country === 'Uganda') {
      if (!receiverPhone.startsWith('+256')) setReceiverPhone('+256 ');
      setReceiverCity('Kampala');
    } else if (country === 'Kenya') {
      if (!receiverPhone.startsWith('+254')) setReceiverPhone('+254 ');
      setReceiverCity('Nairobi');
    } else if (country === 'Tanzania') {
      if (!receiverPhone.startsWith('+255')) setReceiverPhone('+255 ');
      setReceiverCity('Dar es Salaam');
    } else if (country === 'Rwanda') {
      if (!receiverPhone.startsWith('+250')) setReceiverPhone('+250 ');
      setReceiverCity('Kigali');
    } else if (country === 'South Sudan') {
      if (!receiverPhone.startsWith('+211')) setReceiverPhone('+211 ');
      setReceiverCity('Juba');
    }
  };

  const calculations = useMemo(() => {
    const ratePerKg = cargoType === 'Air Freight' ? FREIGHT_RATES.airFreightPerKg : FREIGHT_RATES.seaFreightPerKg;
    const safeWeight = Math.max(0.5, Number(weightKg) || 0);
    const baseCost = Math.round(safeWeight * ratePerKg * 100) / 100;
    const handling = FREIGHT_RATES.handlingFee;
    const insuranceFee = includeInsurance
      ? Math.round((Math.max(0, Number(declaredValueSar) || 0) * FREIGHT_RATES.insuranceRate) * 100) / 100
      : 0;
    const totalSar = Math.round((baseCost + handling + insuranceFee) * 100) / 100;

    const totalUsd = (totalSar * EXCHANGE_RATES.SAR_TO_USD).toFixed(2);
    const totalUgx = Math.round(totalSar * EXCHANGE_RATES.SAR_TO_UGX).toLocaleString();
    const totalKes = Math.round(totalSar * EXCHANGE_RATES.SAR_TO_KES).toLocaleString();

    return {
      ratePerKg,
      baseCost,
      handling,
      insuranceFee,
      totalSar,
      totalUsd,
      totalUgx,
      totalKes,
    };
  }, [cargoType, weightKg, includeInsurance, declaredValueSar]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    // The database sets the price, tracking ID, status, delivery date and first event.
    // The amounts shown on this page are a preview only.
    const payload = {
      cargo_type: cargoType,
      sender_name: senderName.trim(),
      sender_phone: senderPhone.trim(),
      sender_city: senderCity,
      sender_id_iqama: senderIqama.trim() || null,
      receiver_name: receiverName.trim(),
      receiver_phone: receiverPhone.trim(),
      receiver_country: receiverCountry,
      receiver_city: receiverCity.trim(),
      receiver_address: receiverAddress.trim(),
      pickup_address: pickupAddress.trim(),
      pickup_instructions: pickupInstructions.trim(),
      pickup_latitude: pickupLatitude,
      pickup_longitude: pickupLongitude,
      package_type: packageType,
      package_count: Math.max(1, Number(packageCount) || 1),
      weight_kg: Number(weightKg),
      goods_description: goodsDescription.trim() || 'General merchandise',
      declared_value_sar: Math.max(0, Number(declaredValueSar) || 0),
      insured: includeInsurance,
      payment_method: paymentMethod,
    };

    try {
      // Public bookings go through a trusted Supabase Edge Function. It validates
      // input and calculates authoritative charges server-side; no login is required.
      const { data, error } = await supabase.functions.invoke('create-shipment-booking', {
        body: payload,
      });
      if (error) {
        console.warn('[Supabase] Booking failed:', error.message);
        setErrorMessage('We could not create your booking. Please check the details and try again.');
      } else if (data) {
        setConfirmedShipment(data);
        onBookingCreated(data);
      } else {
        setErrorMessage('The booking response was empty. Please refresh before trying again.');
      }
    } catch (error) {
      console.warn('[Supabase] Unexpected booking failure:', error);
      setErrorMessage('A connection issue prevented the booking. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTracking = async () => {
    if (!confirmedShipment?.tracking_id) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(confirmedShipment.tracking_id);
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
    } catch {
      setErrorMessage('Could not copy automatically. Please select and copy the tracking number.');
    }
  };

  const getWhatsAppShareLink = (s) => {
    const text = encodeURIComponent(
      `Hello ${s.receiver_name}, your freight has been booked with Nyago Cargo from ${s.sender_city}, Saudi Arabia to ${s.receiver_city}, ${s.receiver_country}!\n\nTracking ID: ${s.tracking_id}\nService: ${s.cargo_type} (${s.weight_kg}kg)\nStatus: Booking Created\n\nTrack progress anytime at Nyago Cargo Express.`
    );
    return `https://wa.me/${s.receiver_phone.replace(/[^0-9]/g, '')}?text=${text}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">New Cargo Booking</h2>
          <p className="text-sm text-slate-400 mt-1">
            Register express air or ocean container consignment from Saudi Arabia to East Africa.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl font-bold">
            <Plane className="w-3.5 h-3.5 text-amber-400" /> Air: 23 SAR/kg
          </span>
          <span className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl font-bold">
            <Ship className="w-3.5 h-3.5 text-sky-400" /> Sea: 13 SAR/kg
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Mode */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              1. Select Freight Service
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => setCargoType('Air Freight')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
                  cargoType === 'Air Freight'
                    ? 'bg-amber-500/10 border-amber-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl ${
                    cargoType === 'Air Freight' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Plane className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">Direct Air Cargo Express</div>
                  <div className="text-xs text-slate-400 mt-0.5">3 &ndash; 5 Business Days</div>
                  <div className="font-mono text-amber-400 font-black text-xs mt-2 tabular-nums">
                    23 SAR / kg
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCargoType('Sea Freight')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
                  cargoType === 'Sea Freight'
                    ? 'bg-sky-500/10 border-sky-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl ${
                    cargoType === 'Sea Freight' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Ship className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">Ocean Container Consolidated</div>
                  <div className="text-xs text-slate-400 mt-0.5">25 &ndash; 35 Transit Days</div>
                  <div className="font-mono text-sky-400 font-black text-xs mt-2 tabular-nums">
                    13 SAR / kg
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Shipper Details */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Consignor / Shipper (Saudi Arabia)
              </label>
              <span className="text-[11px] text-amber-400 font-bold">Origin: KSA</span>
            </div>

            {currentUser ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Sender details auto-filled from account ({currentUser.name})</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded">
                  {currentUser.accountType}
                </span>
              </div>
            ) : (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">
                  Sign in to book cargo, so you can track and reprint your waybills later.
                </span>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-amber-400 hover:text-amber-300 font-bold whitespace-nowrap text-left"
                >
                  Sign In / Register &rarr;
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Shipper Full Name <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Ismail Mukasa"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Shipper Phone (KSA) <span className="text-amber-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Drop-off Hub / Origin City</label>
                <select
                  value={senderCity}
                  onChange={(e) => setSenderCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Riyadh">Riyadh (Batha / Sulaymaniyah Hub)</option>
                  <option value="Jeddah">Jeddah (Al Balad / Port CFS)</option>
                  <option value="Dammam">Dammam / Al Khobar Branch</option>
                  <option value="Mecca">Mecca Collection Depot</option>
                  <option value="Medina">Medina Station</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Iqama / Saudi ID (ZATCA Export)</label>
                <input
                  type="text"
                  value={senderIqama}
                  onChange={(e) => setSenderIqama(e.target.value)}
                  placeholder="10-digit ID for customs"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          </div>
         {/* 3. Pickup Location */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            3. Pickup Location
          </label>
          <p className="text-xs text-slate-400 mt-1">
            Where should Nyago Cargo collect your shipment?
          </p>
        </div>

        <div>
          <label className="block text-slate-400 mb-1.5 font-medium text-sm">
            Pickup Address <span className="text-amber-500">*</span>
          </label>
          <input
            type="text"
            required
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="Enter building, street, district and city"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1.5 font-medium text-sm">
            Pickup Instructions (Optional)
          </label>
          <textarea
            value={pickupInstructions}
            onChange={(e) => setPickupInstructions(e.target.value)}
            placeholder="Landmark, building number, preferred collection time..."
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-white">Choose the pickup point on the map</p>
            <button type="button" onClick={useCurrentPickupLocation}
              className="w-full sm:w-auto px-4 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400">
              Use My Current Location (GPS)
            </button>
          </div>
          <div ref={pickupMapElementRef} role="application" aria-label="Pickup location map. Tap the map or drag the marker to choose a pickup point."
            className="w-full rounded-2xl border border-slate-700 overflow-hidden bg-slate-800" style={{ height: '320px', minHeight: '280px', zIndex: 0 }} />
          <p className="text-xs text-slate-400">Tap anywhere on the map or drag the pin to select the exact pickup point. GPS permission is optional.</p>
          {pickupMapError && <p className="text-xs text-rose-400">{pickupMapError}</p>}
          {pickupLatitude !== null && pickupLongitude !== null && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <p className="text-xs font-bold text-emerald-400">Pickup point selected</p>
              <p className="text-xs text-slate-300 break-all">Latitude: {pickupLatitude.toFixed(6)} · Longitude: {pickupLongitude.toFixed(6)}</p>
              {!pickupAddress && <p className="text-xs text-slate-400">Address lookup may take a moment. You can also type the address above.</p>}
            </div>
          )}
        </div>

      </div>
          {/* 3. Consignee Details */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                3. Consignee / Recipient (East Africa)
              </label>
              <span className="text-[11px] text-amber-400 font-bold">Destination</span>
            </div>

            {/* Quick Pick Saved Contacts */}
            {currentUser?.savedContacts && currentUser.savedContacts.length > 0 && (
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[11px] text-slate-400 font-semibold">
                  Select from your saved frequent recipients:
                </span>
                <div className="flex flex-wrap gap-2">
                  {currentUser.savedContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectSavedContact(c)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-amber-400 font-semibold transition-colors"
                    >
                      {c.name} ({c.city}, {c.country})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Recipient Full Name <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder="e.g. Grace Nalubega"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Recipient Phone Number <span className="text-amber-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  placeholder="+256 7XX XXX XXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Destination Country</label>
                <select
                  value={receiverCountry}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-bold"
                >
                  <option value="Uganda">Uganda (Entebbe / Kampala)</option>
                  <option value="Kenya">Kenya (Nairobi / Mombasa)</option>
                  <option value="Tanzania">Tanzania (Dar es Salaam)</option>
                  <option value="Rwanda">Rwanda (Kigali)</option>
                  <option value="South Sudan">South Sudan (Juba)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Delivery City / Town</label>
                <input
                  type="text"
                  required
                  value={receiverCity}
                  onChange={(e) => setReceiverCity(e.target.value)}
                  placeholder="e.g. Kampala, Nairobi, Jinja"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Collection Depot or Doorstep Address
                </label>
                <input
                  type="text"
                  required
                  value={receiverAddress}
                  onChange={(e) => setReceiverAddress(e.target.value)}
                  placeholder="e.g. Nyago Central Depot (Nakasero) or Doorstep: Plot 4, Jinja Road"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* 4. Package Declarations */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              4. Package Particulars &amp; Declaration
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Gross Weight (kg) <span className="text-amber-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  required
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Package Format</label>
                <select
                  value={packageType}
                  onChange={(e) => setPackageType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Carton Box">Carton Box</option>
                  <option value="Suitcase / Bag">Suitcase / Traveling Bag</option>
                  <option value="Wooden Crate">Wooden Crate (Fragile)</option>
                  <option value="Sack / Bale">Sack / Compressed Bale</option>
                  <option value="Industrial Pallet">Pallet / Machinery Drum</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Piece Count</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={packageCount}
                  onChange={(e) => setPackageCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Declared Contents <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={goodsDescription}
                  onChange={(e) => setGoodsDescription(e.target.value)}
                  placeholder="e.g. Laptops, perfumes, clothing, abayas, auto spare parts"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">Declared Value (SAR)</label>
                <input
                  type="number"
                  min="0"
                  value={declaredValueSar}
                  onChange={(e) => setDeclaredValueSar(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeInsurance}
                  onChange={(e) => setIncludeInsurance(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700"
                />
                <div>
                  <span className="text-xs font-bold text-slate-200">
                    Comprehensive Transit Cargo Insurance (2% of declared value)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Guarantees total coverage against loss, water damage, or maritime accident.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Price Summary Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-28 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-black text-base">
                <Calculator className="w-5 h-5 text-amber-500" />
                Live Freight Quote
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                {cargoType === 'Air Freight' ? 'AIR EXPRESS' : 'SEA CONTAINER'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>
                  Base Freight ({weightKg} kg &times; {calculations.ratePerKg} SAR)
                </span>
                <span className="font-mono tabular-nums text-white font-bold">
                  {calculations.baseCost.toFixed(2)} SAR
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Customs Documentation &amp; Intake Fee</span>
                <span className="font-mono tabular-nums text-white font-bold">
                  {calculations.handling.toFixed(2)} SAR
                </span>
              </div>
              {includeInsurance && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Transit Insurance (2% of {declaredValueSar} SAR)</span>
                  <span className="font-mono tabular-nums text-white font-bold">
                    {calculations.insuranceFee.toFixed(2)} SAR
                  </span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-white">Total Consignment Fee</div>
                  <div className="text-[11px] text-slate-400">Includes KSA export clearance</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-amber-400 font-mono tabular-nums">
                    {calculations.totalSar.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-slate-400">SAR</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Destination Currency Equivalents
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-900 rounded-xl p-2 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">USD ($)</div>
                  <div className="font-mono tabular-nums font-bold text-white mt-0.5">
                    ${calculations.totalUsd}
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl p-2 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">UGX (Shs)</div>
                  <div className="font-mono tabular-nums font-bold text-amber-400 mt-0.5">
                    {calculations.totalUgx}
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl p-2 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">KES (Ksh)</div>
                  <div className="font-mono tabular-nums font-bold text-sky-400 mt-0.5">
                    {calculations.totalKes}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-medium">Payment Settlement</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('Pending')}
                  className={`py-2 px-3 rounded-xl border font-bold transition-colors ${
                    paymentStatus === 'Pending'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Pay at KSA Drop-off
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('Pay on Delivery')}
                  className={`py-2 px-3 rounded-xl border font-bold transition-colors ${
                    paymentStatus === 'Pay on Delivery'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Pay on Collection
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 active:scale-98 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>Registering Consignment...</>
              ) : (
                <>
                  <Package className="w-5 h-5" />
                  Confirm Booking &amp; Generate AWB Code
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Confirmation Modal */}
      {confirmedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Consignment Booked!</h3>
              <p className="text-xs text-slate-400">
                Your shipment has been saved and broadcasted to the dispatch manifest.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Official Tracking ID
              </div>
              <div className="text-3xl font-black font-mono text-amber-400 tracking-wider">
                {confirmedShipment.tracking_id}
              </div>
              <button
                type="button"
                onClick={copyTracking}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copiedTracking ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Code
                  </>
                )}
              </button>
            </div>

            <div className="text-xs space-y-2 border-y border-slate-800/80 py-3 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Route:</span>
                <span className="font-semibold text-white">
                  {confirmedShipment.sender_city} (KSA) &rarr; {confirmedShipment.receiver_city},{' '}
                  {confirmedShipment.receiver_country}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Freight Mode:</span>
                <span className="font-semibold text-white">{confirmedShipment.cargo_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Gross Weight:</span>
                <span className="font-mono text-white">
                  {confirmedShipment.weight_kg} kg &middot; {confirmedShipment.package_count} pkgs
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Billed:</span>
                <span className="font-mono font-bold text-amber-400">
                  {Number(confirmedShipment.total_cost_sar || 0).toFixed(2)} SAR ({confirmedShipment.payment_status})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenWaybill(confirmedShipment)}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                Print Air Waybill
              </button>
              <a
                href={getWhatsAppShareLink(confirmedShipment)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors"
              >
                <Share2 className="w-4 h-4" />
                WhatsApp Recipient
              </a>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setConfirmedShipment(null)}
                className="text-xs text-amber-400 hover:underline font-semibold"
              >
                Close &amp; Book Another Shipment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 8. RATES & SCHEDULES DIRECTORY VIEW
// ==========================================
function RatesAndSchedulesView({ onNavigateToBooking }) {
  const [calcWeight, setCalcWeight] = useState(25);
  const [calcMode, setCalcMode] = useState('Air');

  const rate = calcMode === 'Air' ? FREIGHT_RATES.airFreightPerKg : FREIGHT_RATES.seaFreightPerKg;
  const baseCost = Math.max(0.5, calcWeight) * rate;
  const totalCostSar = baseCost + FREIGHT_RATES.handlingFee;
  const costUsd = (totalCostSar * EXCHANGE_RATES.SAR_TO_USD).toFixed(2);
  const costUgx = Math.round(totalCostSar * EXCHANGE_RATES.SAR_TO_UGX).toLocaleString();
  const costKes = Math.round(totalCostSar * EXCHANGE_RATES.SAR_TO_KES).toLocaleString();

  return (
    <div className="space-y-12">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <h2 className="text-3xl font-black text-white tracking-tight">
          Transparent Rates, Departure Schedules &amp; Hubs
        </h2>
        <p className="text-slate-400 text-sm">
          Simple per-kilogram pricing connecting Saudi Arabia directly to East Africa with zero hidden surcharges.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Plane className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Direct Air Cargo Express</h3>
                <p className="text-xs text-slate-400">Fast commercial freighters</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black font-mono text-amber-400">23 SAR</div>
              <div className="text-xs text-slate-400">per kilogram</div>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Transit Duration:</strong> 3 &ndash; 5 business days
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Departures:</strong> Every Tuesday &amp; Friday from Riyadh (RUH) &amp; Jeddah (JED)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Best For:</strong> High-value electronics, phones, documents, abayas &amp; urgent packages
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 text-xs text-slate-400 leading-relaxed">
            Direct air manifest filed under ZATCA guidelines with airport bonded release at Entebbe (EBB) and Nairobi (NBO).
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Ship className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Consolidated Ocean Cargo</h3>
                <p className="text-xs text-slate-400">Economical bulk containers</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black font-mono text-sky-400">13 SAR</div>
              <div className="text-xs text-slate-400">per kilogram</div>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Transit Duration:</strong> 25 &ndash; 35 calendar days
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Sailing Schedule:</strong> 1st &amp; 15th of every month from Jeddah Islamic Port
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Best For:</strong> Heavy industrial machinery, bulk textiles, home furniture &amp; barrels
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 text-xs text-slate-400 leading-relaxed">
            Consolidated 40ft High-Cube containers sailing to Port of Mombasa and Dar es Salaam, with bonded overland transit to Kampala.
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-black text-white flex items-center justify-center gap-2">
            <Calculator className="w-5 h-5 text-amber-500" />
            Quick Consignment Rate Estimator
          </h3>
          <p className="text-xs text-slate-400">
            Estimate instant shipping costs with destination currency equivalents.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Select Freight Service</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCalcMode('Air')}
                className={`py-2.5 px-3 rounded-xl border font-bold transition-all ${
                  calcMode === 'Air'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Air (23 SAR)
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('Sea')}
                className={`py-2.5 px-3 rounded-xl border font-bold transition-all ${
                  calcMode === 'Sea'
                    ? 'bg-sky-500 text-slate-950 border-sky-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Sea (13 SAR)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Gross Weight (kg)</label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={calcWeight}
              onChange={(e) => setCalcWeight(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
            />
          </div>
        </div>

        <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 text-center space-y-3">
          <div className="text-xs text-slate-400">Estimated Total (including documentation):</div>
          <div className="text-3xl font-black text-amber-400 font-mono tabular-nums">
            {totalCostSar.toFixed(2)} <span className="text-sm font-normal text-slate-400">SAR</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-300 pt-2 border-t border-slate-900">
            <span>Approx: <strong>${costUsd} USD</strong></span>
            <span>&bull;</span>
            <span className="text-amber-400"><strong>{costUgx} UGX</strong> (Uganda)</span>
            <span>&bull;</span>
            <span className="text-sky-400"><strong>{costKes} KES</strong> (Kenya)</span>
          </div>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onNavigateToBooking}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs transition-all shadow-md"
          >
            Book Shipment with this Rate <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 9. CLIENT SHIPMENTS LIST VIEW
// ==========================================
function ClientShipmentsListView({ currentUser, shipments, onSelectToTrack, onOpenWaybill, onNavigateToBooking, onOpenAuth }) {
  // Row Level Security already limits `shipments` to the signed-in user's own records
  const userShipments = shipments;

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
        <h2 className="text-xl font-black text-white tracking-tight">Sign in to see your consignments</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your bookings, waybills and live status updates are linked to your shipper account.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs"
        >
          Sign In / Register
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {currentUser ? `${currentUser.name}'s Consignments` : 'All Active Consignments'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time status updates, waybills, and delivery milestones.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToBooking}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-all w-fit shadow-md"
        >
          <PlusCircle className="w-4 h-4" />
          Book New Consignment
        </button>
      </div>

      {userShipments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {userShipments.map((s) => (
            <div
              key={s.id || s.tracking_id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 space-y-4 transition-all shadow-md group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-black text-sm tracking-wide">
                      {s.tracking_id}
                    </span>
                    <span className="text-slate-500">&bull;</span>
                    <span className="flex items-center gap-1 text-xs text-slate-300 font-semibold">
                      {s.cargo_type === 'Air Freight' ? (
                        <Plane className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Ship className="w-3.5 h-3.5 text-sky-400" />
                      )}
                      {s.cargo_type}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {s.sender_city} &rarr; {s.receiver_city}, {s.receiver_country}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-sm text-white">
                    {Number(s.total_cost_sar || 0).toFixed(2)} SAR
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{s.weight_kg} kg</div>
                </div>
              </div>

              <div className="bg-slate-950/70 rounded-2xl p-3 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.current_status === 'Delivered'
                        ? 'bg-emerald-400'
                        : s.current_status === 'In Transit'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-sky-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-200">{s.current_status}</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Est: {s.estimated_delivery}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => onOpenWaybill(s)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  Print Waybill (AWB)
                </button>
                <button
                  type="button"
                  onClick={() => onSelectToTrack(s.tracking_id)}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold transition-colors"
                >
                  View Live Checkpoints <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">No Shipments Recorded</h3>
          <p className="text-xs text-slate-400">
            Book your first freight consignment to track its movement directly from this dashboard.
          </p>
          <button
            type="button"
            onClick={onNavigateToBooking}
            className="text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 px-5 py-2.5 rounded-xl transition-all"
          >
            Book Consignment Now
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 10. SHIPPER PROFILE & ADDRESS BOOK
// ==========================================
function UserProfileAndAddressBookView({
  user,
  shipments,
  onUpdateProfile,
  onAddContact,
  onNavigateToBooking,
  onSelectToTrack,
  onLogout,
}) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('+256 ');
  const [contactCountry, setContactCountry] = useState('Uganda');
  const [contactCity, setContactCity] = useState('Kampala');
  const [contactAddress, setContactAddress] = useState('');

  const [editPhone, setEditPhone] = useState(user.phone);
  const [editCity, setEditCity] = useState(user.city);
  const [editIqama, setEditIqama] = useState(user.idNumber || '');
  const [editBusiness, setEditBusiness] = useState(user.businessName || '');

  const userShipments = shipments; // already limited to this user by Row Level Security

  const activeCount = userShipments.filter((s) => s.current_status !== 'Delivered').length;
  const totalWeight = userShipments.reduce((sum, s) => sum + Number(s.weight_kg || 0), 0);

  const handleProfileSave = (e) => {
    e.preventDefault();
    onUpdateProfile({
      phone: editPhone,
      city: editCity,
      idNumber: editIqama,
      businessName: editBusiness,
    });
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactName.trim()) return;
    onAddContact({
      name: contactName.trim(),
      phone: contactPhone.trim(),
      country: contactCountry,
      city: contactCity.trim(),
      address: contactAddress.trim() || 'Central Collection Depot',
    });
    setContactName('');
    setContactAddress('');
    setShowAddContact(false);
  };

  return (
    <div className="space-y-8">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              {user.accountType === 'Commercial Importer' ? (
                <Building2 className="w-7 h-7" />
              ) : (
                <User className="w-7 h-7" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-white tracking-tight">{user.name}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  {user.accountType}
                </span>
              </div>
              {user.businessName && (
                <div className="text-xs font-semibold text-slate-300">{user.businessName}</div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {user.city}, {user.country}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1 font-mono text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {user.phone}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {user.email}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToBooking}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-md"
            >
              <PlusCircle className="w-4 h-4" />
              Book New Cargo
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-medium">Total Bookings</div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {userShipments.length}
            </div>
          </div>
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-medium">In Transit</div>
            <div className="text-2xl font-black font-mono text-amber-400 mt-1">
              {activeCount}
            </div>
          </div>
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-medium">Gross Cargo Weight</div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {totalWeight.toLocaleString()} <span className="text-xs font-normal text-slate-400">kg</span>
            </div>
          </div>
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-medium">Saved Contacts</div>
            <div className="text-2xl font-black font-mono text-sky-400 mt-1">
              {user.savedContacts?.length || 0}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              Shipper Profile Information
            </h3>
            <span className="text-xs text-slate-400 font-mono">KSA Origin</span>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Shipper Phone (Saudi Arabia)</label>
              <input
                type="tel"
                required
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Primary Hub / Base City</label>
              <select
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Riyadh">Riyadh (Batha / Sulaymaniyah)</option>
                <option value="Jeddah">Jeddah (Al Balad / Port)</option>
                <option value="Dammam">Dammam / Al Khobar</option>
                <option value="Mecca">Mecca</option>
                <option value="Medina">Medina</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Iqama / National ID (ZATCA Export)</label>
              <input
                type="text"
                value={editIqama}
                onChange={(e) => setEditIqama(e.target.value)}
                placeholder="10-digit ID for customs"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {user.accountType === 'Commercial Importer' && (
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Commercial Trading Company</label>
                <input
                  type="text"
                  value={editBusiness}
                  onChange={(e) => setEditBusiness(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-5 rounded-xl transition-all shadow-md"
            >
              Save Profile Changes
            </button>
          </form>
        </div>

        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-400" />
              Frequent Recipient Address Book
            </h3>
            <button
              type="button"
              onClick={() => setShowAddContact(!showAddContact)}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Recipient
            </button>
          </div>

          {showAddContact && (
            <form
              onSubmit={handleContactSubmit}
              className="bg-slate-950 p-4 rounded-2xl border border-amber-500/30 space-y-3 text-xs"
            >
              <div className="font-bold text-white text-xs">New Consignee Contact</div>
              <div>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+256 7XX XXX"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                />
                <select
                  value={contactCountry}
                  onChange={(e) => setContactCountry(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-bold"
                >
                  <option value="Uganda">Uganda</option>
                  <option value="Kenya">Kenya</option>
                  <option value="Tanzania">Tanzania</option>
                  <option value="Rwanda">Rwanda</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={contactCity}
                  onChange={(e) => setContactCity(e.target.value)}
                  placeholder="City (Kampala / Nairobi)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                />
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="Street / Depot Address"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 text-slate-950 font-black rounded-xl"
                >
                  Save to Book
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {user.savedContacts && user.savedContacts.length > 0 ? (
              user.savedContacts.map((cnt) => (
                <div
                  key={cnt.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-white">
                    <span>{cnt.name}</span>
                    <span className="text-[10px] text-sky-400 font-mono font-bold">{cnt.country}</span>
                  </div>
                  <div className="font-mono text-slate-400 text-[11px]">{cnt.phone}</div>
                  <div className="text-slate-400 text-[11px]">
                    {cnt.address}, {cnt.city}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No saved frequent recipients yet. Add contacts here for 1-click booking autofill.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 11. OFFICIAL PRINTABLE WAYBILL & BOL MODAL
// ==========================================
function OfficialWaybillModal({ shipment, onClose }) {
  if (!shipment) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="waybill-wrap fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="waybill-box bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        <div className="no-print p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 rounded-t-3xl">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Official Transport Document
            </span>
            <span className="font-mono text-amber-400 font-black text-sm">
              {shipment.tracking_id}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Shipping Document / Label
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 bg-white text-slate-950 space-y-6 text-xs font-sans">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-950 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <div className="bg-amber-500 text-slate-950 p-1.5 rounded font-black text-lg">
                  {shipment.cargo_type === 'Air Freight' ? (
                    <Plane className="w-5 h-5" />
                  ) : (
                    <Ship className="w-5 h-5" />
                  )}
                </div>
                <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase">
                  NYAGO CARGO &amp; LOGISTICS
                </h1>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 font-semibold">
                Saudi Arabia &bull; East Africa Freight Express Service
              </p>
              <p className="text-[10px] text-slate-500">
                Hubs: Riyadh &bull; Jeddah &bull; Dammam &bull; Kampala &bull; Nairobi
              </p>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                {shipment.cargo_type === 'Air Freight'
                  ? 'NON-NEGOTIABLE AIR WAYBILL (AWB)'
                  : 'CONSOLIDATED OCEAN BILL OF LADING'}
              </div>
              <div className="text-2xl font-black font-mono tracking-wider text-slate-950 mt-0.5">
                {shipment.tracking_id}
              </div>
              <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                Issue Date: {new Date(shipment.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 border border-slate-950 divide-y sm:divide-y-0 sm:divide-x divide-slate-950">
            <div className="p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                1. Shipper / Consignor (Saudi Arabia)
              </div>
              <div className="font-bold text-sm text-slate-950">{shipment.sender_name}</div>
              <div className="font-mono text-slate-700">{shipment.sender_phone}</div>
              <div className="text-slate-700">Origin Depot: {shipment.sender_city}, KSA</div>
              {shipment.sender_id_iqama && (
                <div className="font-mono text-[10px] text-slate-600">
                  National ID / Iqama: {shipment.sender_id_iqama}
                </div>
              )}
            </div>

            <div className="p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                2. Consignee / Recipient ({shipment.receiver_country})
              </div>
              <div className="font-bold text-sm text-slate-950">{shipment.receiver_name}</div>
              <div className="font-mono text-slate-700">{shipment.receiver_phone}</div>
              <div className="text-slate-800 font-medium">
                {shipment.receiver_address}, {shipment.receiver_city}
              </div>
              <div className="font-bold text-slate-950">{shipment.receiver_country}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 border border-slate-950 divide-x divide-slate-950 text-center text-[11px]">
            <div className="p-2.5">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Departure Port</span>
              <span className="font-bold text-slate-950">
                {shipment.sender_city === 'Jeddah'
                  ? 'JED / Jeddah Port'
                  : shipment.sender_city === 'Riyadh'
                  ? 'RUH / King Khalid Intl'
                  : 'DMM / King Fahd Intl'}
              </span>
            </div>
            <div className="p-2.5">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Destination Hub</span>
              <span className="font-bold text-slate-950">
                {shipment.receiver_country === 'Uganda'
                  ? 'EBB / Kampala Station'
                  : shipment.receiver_country === 'Kenya'
                  ? 'NBO / Port of Mombasa'
                  : `${shipment.receiver_city} Hub`}
              </span>
            </div>
            <div className="p-2.5">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Service Mode</span>
              <span className="font-bold text-slate-950">{shipment.cargo_type}</span>
            </div>
            <div className="p-2.5">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Target Delivery</span>
              <span className="font-mono font-bold text-slate-950">{shipment.estimated_delivery}</span>
            </div>
          </div>

          <div className="border border-slate-950">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-100 border-b border-slate-950 text-[10px] uppercase font-bold text-slate-700">
                <tr>
                  <th className="p-2 border-r border-slate-950">Pieces</th>
                  <th className="p-2 border-r border-slate-950">Package Type</th>
                  <th className="p-2 border-r border-slate-950">Gross Weight</th>
                  <th className="p-2 border-r border-slate-950">Declared Contents</th>
                  <th className="p-2 text-right">Declared Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                <tr>
                  <td className="p-2 border-r border-slate-950 font-mono font-bold text-center">
                    {shipment.package_count}
                  </td>
                  <td className="p-2 border-r border-slate-950 font-medium">{shipment.package_type}</td>
                  <td className="p-2 border-r border-slate-950 font-mono font-bold">
                    {shipment.weight_kg} kg
                  </td>
                  <td className="p-2 border-r border-slate-950 font-medium">
                    {shipment.goods_description}
                  </td>
                  <td className="p-2 text-right font-mono font-bold">
                    {shipment.declared_value_sar || 0} SAR
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-950 p-3 text-[11px] space-y-1">
              <div className="font-bold uppercase text-[10px] text-slate-600">Handling &amp; Customs</div>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Security Screened &bull; Customs Export Bonded
              </div>
              <p className="text-[10px] text-slate-600 leading-tight">
                Consignment verified safe for air transport or ocean container stowage under KSA ZATCA &amp; IATA/IMO regulations.
              </p>
            </div>
            <div className="border border-slate-950 p-3 text-[11px] space-y-1 text-right">
              <div className="flex justify-between text-slate-600">
                <span>Freight ({shipment.rate_per_kg} SAR/kg):</span>
                <span className="font-mono">{Number(shipment.base_cost_sar || 0).toFixed(2)} SAR</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Documentation / Intake:</span>
                <span className="font-mono">{Number(shipment.handling_fee_sar || 0).toFixed(2)} SAR</span>
              </div>
              {shipment.insurance_fee_sar > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Transit Insurance:</span>
                  <span className="font-mono">{Number(shipment.insurance_fee_sar || 0).toFixed(2)} SAR</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-slate-950 pt-1 border-t border-slate-300">
                <span>Total Amount:</span>
                <span className="font-mono">{Number(shipment.total_cost_sar || 0).toFixed(2)} SAR</span>
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                Status: <strong className="text-slate-950 uppercase">{shipment.payment_status}</strong>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-slate-950 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-1 h-12 px-2 bg-white">
                {Array.from({ length: 48 }).map((_, i) => (
                  <div
                    key={i}
                    className={`bg-slate-950 h-full ${
                      i % 7 === 0 || i % 5 === 0 ? 'w-1' : i % 3 === 0 ? 'w-1.5' : 'w-0.5'
                    } ${i % 11 === 0 ? 'opacity-0' : 'opacity-100'}`}
                  />
                ))}
              </div>
              <div className="font-mono text-center font-bold tracking-widest text-xs text-slate-950">
                *{shipment.tracking_id}*
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[10px] text-center">
              <div className="w-32 border-b border-slate-950 pb-1">
                <div className="h-8" />
                <span>Shipper Signature</span>
              </div>
              <div className="w-32 border-b border-slate-950 pb-1">
                <div className="h-8 font-mono text-slate-400 flex items-center justify-center">
                  [STAMP: NYAGO]
                </div>
                <span>Authorized Cargo Agent</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
