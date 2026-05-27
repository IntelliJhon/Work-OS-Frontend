import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { invitationsApi } from '../../services/api/invitations';
import type { VerifyInvitationResponse } from '../../services/api/invitations';
import { useAuthStore } from '../../store/authStore';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import axios from 'axios';

const acceptSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password confirmation must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AcceptFormValues = z.infer<typeof acceptSchema>;

export const AcceptInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);
  
  // Local state
  const [verifying, setVerifying] = useState(true);
  const [inviteDetails, setInviteDetails] = useState<VerifyInvitationResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptFormValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Verify invitation token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setVerifyError('Invitation token is missing from the URL.');
        setVerifying(false);
        return;
      }
      try {
        const details = await invitationsApi.verify(token);
        setInviteDetails(details);
      } catch (err) {
        console.error('[AcceptInvite] Verification error', err);
        let msg = 'Invalid or expired invitation link.';
        if (axios.isAxiosError(err)) {
          msg = err.response?.data?.error || msg;
        }
        setVerifyError(msg);
      } finally {
        setVerifying(false);
      }
    };
    verifyToken();
  }, [token]);

  const onSubmit = async (data: AcceptFormValues) => {
    if (!token) return;
    setLoading(true);
    setSubmitError(null);

    try {
      const response = await invitationsApi.accept({
        token,
        password: data.password,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
      });

      const { accessToken, refreshToken, user } = response;
      loginStore(user, accessToken, refreshToken);
      navigate('/dashboard');
    } catch (err) {
      console.error('[AcceptInvite] Error during onboarding acceptance', err);
      let errMsg = 'Failed to accept invitation. Please try again.';
      if (axios.isAxiosError(err)) {
        errMsg = err.response?.data?.error || errMsg;
      } else if (err instanceof Error) {
        errMsg = err.message;
      }
      setSubmitError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="w-full text-center space-y-4 py-8">
        <div className="relative w-10 h-10 mx-auto">
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-blue-500 animate-spin"></div>
          <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-indigo-500/20 animate-spin duration-1000"></div>
        </div>
        <p className="text-xs text-muted-foreground font-light tracking-widest uppercase animate-pulse">
          Verifying security token...
        </p>
      </div>
    );
  }

  if (verifyError || !inviteDetails) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">Invalid Invitation</h2>
          <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
            {verifyError || 'This invitation details could not be retrieved.'}
          </p>
        </div>

        <div className="pt-4 flex flex-col space-y-3">
          <Link
            to="/login"
            className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-slate-100/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 hover:bg-slate-200/60 dark:bg-white/10 text-white text-center transition"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">Join Workspace</h2>
        <p className="text-xs text-muted-foreground font-light">
          Set up your workspace profile for <span className="text-blue-400 font-semibold">{inviteDetails.tenantName}</span>
        </p>
      </div>

      {submitError && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
          <span className="font-light">{submitError}</span>
        </div>
      )}

      {/* Invite Context Box */}
      <div className="p-3.5 rounded-xl bg-white/2 border border-slate-100 dark:border-white/5 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-zinc-500">Your Email:</span>
          <span className="font-mono text-slate-700 dark:text-zinc-300 font-medium">{inviteDetails.email}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-slate-500 dark:text-zinc-500">Role Assigned:</span>
          <span className="text-blue-400 font-semibold flex items-center space-x-1">
            <span>{inviteDetails.roleName}</span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name Fields Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              First Name
            </label>
            <div className="relative">
              <input
                {...register('firstName')}
                placeholder="John"
                className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
              />
            </div>
            {errors.firstName && (
              <p className="text-[10px] text-red-400 font-light">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Last Name
            </label>
            <div className="relative">
              <input
                {...register('lastName')}
                placeholder="Doe"
                className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
              />
            </div>
            {errors.lastName && (
              <p className="text-[10px] text-red-400 font-light">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Password Inputs */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Password
          </label>
          <input
            {...register('password')}
            type="password"
            placeholder="Min. 8 characters"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.password && (
            <p className="text-[10px] text-red-400 font-light">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Confirm Password
          </label>
          <input
            {...register('confirmPassword')}
            type="password"
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.confirmPassword && (
            <p className="text-[10px] text-red-400 font-light">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center space-x-2 transition-all shadow-lg glow-primary active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span>Onboard & Setup Account</span>
              <ArrowRight className="w-4.5 h-4.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default AcceptInvite;
