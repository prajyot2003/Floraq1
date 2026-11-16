import React from 'react';
import {
  Sprout,
  Video,
  Activity,
  GitBranch,
  BrainCircuit,
  Cpu,
  FileSpreadsheet,
  Sparkles,
  Wifi,
  LogOut,
  User,
  Radio,
} from 'lucide-react';
import { UserProfile } from '../types.js';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenSimulator: () => void;
  isStreamActive: boolean;
  firebaseConnected?: boolean;
  hasSensorError?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  user,
  onOpenAuth,
  onOpenSettings,
  onLogout,
  onOpenSimulator,
  isStreamActive,
  firebaseConnected = false,
  hasSensorError = false,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Plants & Plans', icon: Sprout },
    { id: 'camera', label: 'Live Camera', icon: Video, badge: isStreamActive ? 'LIVE' : undefined },
    { id: 'cycles', label: 'Growth Cycles', icon: GitBranch },
    { id: 'ai-health', label: 'AI Health & Disease', icon: BrainCircuit },
    { id: 'ai-growth', label: 'AI Growth Projection', icon: Sparkles },
    { id: 'devices', label: 'IoT Gateway', icon: Cpu },
    { id: 'logs', label: 'Care Logs & Export', icon: FileSpreadsheet },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#174D36] text-white shadow-md border-b border-[#21593D]">
      {/* Top Banner with System Telemetry Badges */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
            <div className="w-10 h-10 rounded-lg bg-[#39805B] flex items-center justify-center text-[#DCEFE2] shadow-inner">
              <Sprout className="w-6 h-6 text-[#DCEFE2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">FloraQ</span>
                <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold bg-[#39805B] text-[#DCEFE2] rounded">
                  Phytopod 360
                </span>
              </div>
              <p className="text-xs text-[#DCEFE2]/80 font-medium hidden sm:block">
                Intelligent Plant Trainer & IoT Telemetry Gateway
              </p>
            </div>
          </div>

          {/* Center Chamber Diagnostics Pill */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#143B2A] border border-[#2A6547] text-xs text-[#DCEFE2]">
              <span className={`w-2 h-2 rounded-full ${firebaseConnected ? 'bg-emerald-400' : 'bg-[#39805B]'}`}></span>
              <span>Chamber Alpha-01</span>
            </div>
            {firebaseConnected && hasSensorError && (
              <button
                onClick={onOpenSimulator}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600/90 hover:bg-rose-600 border border-rose-400 text-xs font-bold text-white shadow-xs transition"
                title="Sensor Error detected: stale timestamp, missing fields, or faulty reading"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                <span>Sensor Error</span>
              </button>
            )}
          </div>

          {/* Right Action & User Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenSimulator}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#39805B] hover:bg-[#43966B] text-white text-xs font-semibold shadow-sm transition border border-[#4EA87A]"
              title="Open Phytopod 360 IoT Gateway, Sensors & 4-Zone Irrigation Control"
            >
              <Activity className="w-3.5 h-3.5 text-[#DCEFE2]" />
              <span>IoT & Irrigation</span>
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenSettings}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#143B2A] hover:bg-[#1C4A35] text-xs text-[#DCEFE2] border border-[#2A6547] transition"
                  title="Profile and settings"
                >
                  <User className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="max-w-[120px] truncate hidden md:inline">{user.full_name}</span>
                </button>
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-md text-[#DCEFE2]/70 hover:text-white hover:bg-[#143B2A] transition"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-3 py-1.5 text-xs font-semibold text-[#174D36] bg-[#DCEFE2] hover:bg-white rounded-md transition"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-[#143D2B] border-t border-[#1F543B] overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-3 py-2 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    isActive
                      ? 'bg-[#DCEFE2] text-[#174D36] shadow-sm font-semibold'
                      : 'text-[#DCEFE2]/80 hover:text-white hover:bg-[#1E4D36]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#174D36]' : 'text-[#DCEFE2]/70'}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
