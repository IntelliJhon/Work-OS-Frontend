import React, { useState, useMemo, useEffect } from 'react';
import { complaintsApi } from '../../services/api/complaints';
import type { Complaint } from '../../services/api/complaints';
import {
  MessageSquareWarning,
  MessageSquare,
  Search,
  Filter,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Phone,
  Mail,
  Calendar,
  X,
  Eye,
  Sparkles,
  ShieldAlert,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  Building2
} from 'lucide-react';

export const ComplaintsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'waau' | 'direct-sms'>('waau');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modals & Active Selections
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Complaint Form State
  const [newSubject, setNewSubject] = useState('');
  const [newComplainantName, setNewComplainantName] = useState('');
  const [newComplainantPhone, setNewComplainantPhone] = useState('');
  const [newComplainantEmail, setNewComplainantEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newCategory, setNewCategory] = useState<Complaint['category']>('Technical');
  const [newPriority, setNewPriority] = useState<Complaint['priority']>('medium');
  const [newDescription, setNewDescription] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadComplaints = async () => {
    setIsLoading(true);
    try {
      const data = await complaintsApi.list();
      setComplaints(data);
    } catch (err) {
      console.error('[ComplaintsPage] Failed to fetch complaints from backend API', err);
      showToast('Failed to load complaints from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadComplaints();
  }, []);

  // Filter complaints by current tab & filters
  const currentTabComplaints = useMemo(() => {
    return complaints.filter((item) => item.channel === activeTab);
  }, [complaints, activeTab]);

  const filteredComplaints = useMemo(() => {
    return currentTabComplaints.filter((item) => {
      const matchesSearch =
        item.ticketId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.complainantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.company && item.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.complainantPhone.includes(searchQuery);

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [currentTabComplaints, searchQuery, statusFilter, priorityFilter]);

  // Statistics for current tab
  const stats = useMemo(() => {
    const total = currentTabComplaints.length;
    const open = currentTabComplaints.filter((c) => c.status === 'open').length;
    const inProgress = currentTabComplaints.filter((c) => c.status === 'in-progress').length;
    const resolved = currentTabComplaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
    return { total, open, inProgress, resolved };
  }, [currentTabComplaints]);

  // Handle status update
  const handleStatusChange = (id: string, newStatus: Complaint['status']) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c))
    );
    if (selectedComplaint && selectedComplaint.id === id) {
      setSelectedComplaint((prev) => prev ? { ...prev, status: newStatus, updatedAt: new Date().toISOString() } : null);
    }
    showToast(`Complaint status updated to "${newStatus.toUpperCase()}"`);
  };

  // Handle Submit New Complaint
  const handleCreateComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject || !newComplainantName || !newComplainantPhone || !newDescription) {
      alert('Please fill out all required fields.');
      return;
    }

    const prefix = activeTab === 'waau' ? 'WAAU' : 'SMS';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const newEntry: Complaint = {
      id: `c-${Date.now()}`,
      ticketId: `${prefix}-${randNum}`,
      channel: activeTab,
      complainantName: newComplainantName,
      complainantPhone: newComplainantPhone,
      complainantEmail: newComplainantEmail || undefined,
      company: newCompany || undefined,
      imageUrl: newImageUrl || undefined,
      subject: newSubject,
      description: newDescription,
      category: newCategory,
      priority: newPriority,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setComplaints((prev) => [newEntry, ...prev]);
    setShowAddModal(false);
    showToast(`New ${prefix} complaint #${newEntry.ticketId} created!`);

    // Reset form
    setNewSubject('');
    setNewComplainantName('');
    setNewComplainantPhone('');
    setNewComplainantEmail('');
    setNewCompany('');
    setNewImageUrl('');
    setNewDescription('');
  };

  const getPriorityBadge = (priority: Complaint['priority']) => {
    switch (priority) {
      case 'critical':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500/15 text-red-400 border border-red-500/30 flex items-center space-x-1 shrink-0"><ShieldAlert className="w-3 h-3 mr-0.5 inline" /> Critical</span>;
      case 'high':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500/15 text-orange-400 border border-orange-500/30 shrink-0">High</span>;
      case 'medium':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">Medium</span>;
      case 'low':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase bg-slate-500/15 text-slate-400 border border-slate-500/30 shrink-0">Low</span>;
    }
  };

  const getStatusBadge = (status: Complaint['status']) => {
    switch (status) {
      case 'open':
        return <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">Open</span>;
      case 'in-progress':
        return <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">In Progress</span>;
      case 'resolved':
        return <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Resolved</span>;
      case 'closed':
        return <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Closed</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl bg-slate-900/90 dark:bg-zinc-900/90 text-white border border-blue-500/30 shadow-2xl backdrop-blur-md animate-scale-in">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header Title Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <MessageSquareWarning className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Complaints Center</h1>
              <p className="text-xs text-muted-foreground font-light mt-0.5">
                Centralized grievance handling connected live to Google Sheet dispatchers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => void loadComplaints()}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border text-xs transition"
            title="Refresh Complaints"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New {activeTab === 'waau' ? 'WAAU' : 'Direct SMS'} Complaint</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center space-x-2 p-1.5 rounded-2xl bg-card/60 border border-border/80 backdrop-blur-xl w-fit">
        <button
          onClick={() => setActiveTab('waau')}
          className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'waau'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <MessageSquareWarning className="w-4 h-4" />
          <span>WAAU Complaints</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'waau' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
            {complaints.filter((c) => c.channel === 'waau').length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('direct-sms')}
          className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'direct-sms'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Direct SMS Complaints</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'direct-sms' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
            {complaints.filter((c) => c.channel === 'direct-sms').length}
          </span>
        </button>
      </div>

      {/* Stat KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-border/60 bg-card/40">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-medium">Total Complaints</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{stats.total}</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <span className="text-[11px] font-medium">Open & Unresolved</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-rose-500 font-mono">{stats.open}</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center justify-between text-blue-400 mb-2">
            <span className="text-[11px] font-medium">In Progress</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-blue-400 font-mono">{stats.inProgress}</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-[11px] font-medium">Resolved</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{stats.resolved}</p>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="glass-panel rounded-2xl p-4 border border-border bg-card/40 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search ticket, user, company, details or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900/70 border border-border rounded-xl pl-9 pr-4 py-2 text-xs font-light text-slate-900 dark:text-white placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 transition"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-1.5 text-xs text-muted-foreground font-light">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-zinc-900/70 border border-border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-white dark:bg-zinc-900/70 border border-border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Complaints Table View */}
      <div className="glass-panel rounded-2xl border border-border bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">{activeTab === 'waau' ? 'Complaint Number' : 'Complaint Id'}</th>
                <th className="px-6 py-4">{activeTab === 'waau' ? 'User & Company' : 'Client Name'}</th>
                <th className="px-6 py-4">Phonenumber</th>
                <th className="px-6 py-4">Complaint Details</th>
                <th className="px-6 py-4">Attachment</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground font-light italic">
                    Loading live complaints from Google Sheet backend...
                  </td>
                </tr>
              ) : filteredComplaints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground font-light italic">
                    No complaints match current filters for {activeTab === 'waau' ? 'WAAU Complaints' : 'Direct SMS Complaints'}.
                  </td>
                </tr>
              ) : (
                filteredComplaints.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    {/* Ticket / Complaint ID */}
                    <td className="px-6 py-4 font-mono font-bold text-blue-400">
                      <div className="flex items-center space-x-1.5">
                        <span>{item.ticketId}</span>
                      </div>
                    </td>

                    {/* Complainant / User / Company */}
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{item.complainantName}</span>
                        </p>
                        {item.company && (
                          <p className="text-[11px] text-muted-foreground flex items-center space-x-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-blue-400 shrink-0" />
                            <span>{item.company}</span>
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Phone Number */}
                    <td className="px-6 py-4 font-mono text-slate-700 dark:text-zinc-300">
                      <div className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{item.complainantPhone}</span>
                      </div>
                    </td>

                    {/* Complaint Details */}
                    <td className="px-6 py-4 max-w-xs">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white line-clamp-2">{item.description}</p>
                      </div>
                    </td>

                    {/* Image Attachment preview */}
                    <td className="px-6 py-4">
                      {item.imageUrl ? (
                        <button
                          onClick={() => setShowImagePreview(item.imageUrl!)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 text-[11px] font-medium transition"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>View Image</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60 italic">No image</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedComplaint(item)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 text-xs font-semibold transition-all inline-flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complaint Detail Modal */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl glass-panel-heavy rounded-2xl p-6 shadow-2xl border border-border bg-white dark:bg-zinc-950 relative animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedComplaint(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono">{selectedComplaint.ticketId}</h3>
                  {getPriorityBadge(selectedComplaint.priority)}
                  {getStatusBadge(selectedComplaint.status)}
                </div>
                <p className="text-xs text-muted-foreground font-light mt-0.5">
                  Channel: <span className="uppercase font-bold text-foreground">{selectedComplaint.channel}</span>
                </p>
              </div>
            </div>

            <div className="space-y-5 text-xs">
              {/* Complainant Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Complainant Contact</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedComplaint.complainantName}</p>
                  {selectedComplaint.company && (
                    <p className="text-muted-foreground mt-1 flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Company: {selectedComplaint.company}</span>
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 flex items-center space-x-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{selectedComplaint.complainantPhone}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Properties & Timestamp</p>
                  <div>
                    <span className="text-muted-foreground">Assigned Handler: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{selectedComplaint.assignedTo || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Logged Date: </span>
                    <span className="font-mono text-slate-900 dark:text-white">{new Date(selectedComplaint.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Complaint Details</p>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-border text-slate-800 dark:text-zinc-200 leading-relaxed font-light whitespace-pre-wrap">
                  {selectedComplaint.description}
                </div>
              </div>

              {/* Image Preview if available */}
              {selectedComplaint.imageUrl && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center space-x-1">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Attached Complaint Screenshot</span>
                  </p>
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-border flex items-center justify-between">
                    <a
                      href={selectedComplaint.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline flex items-center space-x-1 text-xs truncate max-w-md font-mono"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{selectedComplaint.imageUrl}</span>
                    </a>
                    <button
                      onClick={() => setShowImagePreview(selectedComplaint.imageUrl!)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shrink-0"
                    >
                      Preview Image
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons: Status Change */}
              <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Update Status:</span>
                  <button
                    onClick={() => handleStatusChange(selectedComplaint.id, 'open')}
                    className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-bold transition"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedComplaint.id, 'in-progress')}
                    className="px-3 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[11px] font-bold transition"
                  >
                    In Progress
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedComplaint.id, 'resolved')}
                    className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold transition"
                  >
                    Resolve
                  </button>
                </div>

                <button
                  onClick={() => setSelectedComplaint(null)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Overlay Modal */}
      {showImagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button
              onClick={() => setShowImagePreview(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white bg-white/10 rounded-full transition"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={showImagePreview}
              alt="Complaint Attachment"
              className="max-h-[80vh] max-w-full object-contain rounded-2xl border border-white/10 shadow-2xl"
              onError={() => {
                alert('Could not load image URL preview.');
                setShowImagePreview(null);
              }}
            />
            <div className="mt-4 flex items-center space-x-3">
              <a
                href={showImagePreview}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-lg"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Original Image Link</span>
              </a>
              <button
                onClick={() => setShowImagePreview(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Complaint Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg glass-panel-heavy rounded-2xl p-6 shadow-2xl border border-border bg-white dark:bg-zinc-950 relative animate-scale-in">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Log New {activeTab === 'waau' ? 'WAAU' : 'Direct SMS'} Complaint
                </h3>
                <p className="text-xs text-muted-foreground font-light mt-0.5">
                  Record an incoming grievance into the workspace dispatcher system.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateComplaint} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Complainant Name / User *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. shahariyas"
                  value={newComplainantName}
                  onChange={(e) => setNewComplainantName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="919061451636"
                    value={newComplainantPhone}
                    onChange={(e) => setNewComplainantPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                  />
                </div>

                {activeTab === 'waau' ? (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Company
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. intellijohn"
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="john@company.com"
                      value={newComplainantEmail}
                      onChange={(e) => setNewComplainantEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Complaint Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://media-gallery.s3.amazonaws.com/image.png"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Complaint Details *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide detailed description of the complaint..."
                  value={newDescription}
                  onChange={(e) => {
                    setNewDescription(e.target.value);
                    setNewSubject(e.target.value.substring(0, 40));
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/20 transition"
                >
                  Create Complaint Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintsPage;
