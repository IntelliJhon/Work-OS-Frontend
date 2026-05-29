import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api/client';
import { ShieldAlert, ArrowRight, CheckCircle2, KeyRound } from 'lucide-react';
import axios from 'axios';

const forgotPasswordSchema = z.object({
  workspace: z.string().min(3, 'Workspace slug must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password confirmation must be at least 6 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ForgotFormValues = z.infer<typeof forgotPasswordSchema>;
type ResetFormValues = z.infer<typeof resetPasswordSchema>;

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form for Step 1
  const forgotForm = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      workspace: '',
      email: '',
    },
  });

  // Form for Step 2
  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onForgotSubmit = async (data: ForgotFormValues) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await apiClient.post('/auth/forgot-password', {
        workspace: data.workspace.trim(),
        email: data.email.trim(),
      });
      
      setResetToken(response.data.resetToken);
      setSuccessMsg('Account verified. Please choose a new password.');
      setStep(2);
    } catch (err) {
      console.error('[ForgotPassword] Error verification', err);
      let errMsg = 'No user registered with this email in the specified workspace';
      if (axios.isAxiosError(err)) {
        errMsg = err.response?.data?.error || errMsg;
      }
      setErrorMsg(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const onResetSubmit = async (data: ResetFormValues) => {
    if (!resetToken) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await apiClient.post('/auth/reset-password', {
        resetToken,
        newPassword: data.password,
      });

      setSuccessMsg('Password has been reset successfully!');
      setStep(2); // Keep step but show clean overlay or navigate
      
      // Auto navigate to login page after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      console.error('[ResetPassword] Error updating', err);
      let errMsg = 'Failed to reset password. Please try again.';
      if (axios.isAxiosError(err)) {
        errMsg = err.response?.data?.error || errMsg;
      }
      setErrorMsg(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">
          {step === 1 ? 'Reset Password' : 'Choose New Password'}
        </h2>
        <p className="text-xs text-muted-foreground font-light">
          {step === 1
            ? 'Enter your workspace details and registered email address'
            : 'Enter and confirm your new secure password'}
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-shake">
          <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
          <span className="font-light">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
          <span className="font-light">{successMsg}</span>
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
          {/* Workspace Slug */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Workspace Slug
            </label>
            <input
              {...forgotForm.register('workspace')}
              placeholder="e.g. acme-corp"
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
            />
            {forgotForm.formState.errors.workspace && (
              <p className="text-[10px] text-red-400 font-light">{forgotForm.formState.errors.workspace.message}</p>
            )}
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Email Address
            </label>
            <input
              {...forgotForm.register('email')}
              type="email"
              placeholder="name@company.com"
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
            />
            {forgotForm.formState.errors.email && (
              <p className="text-[10px] text-red-400 font-light">{forgotForm.formState.errors.email.message}</p>
            )}
          </div>

          {/* Submit Step 1 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center space-x-2 transition-all shadow-lg glow-primary active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Verify Workspace & Email</span>
                <ArrowRight className="w-4.5 h-4.5" />
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              New Password
            </label>
            <input
              {...resetForm.register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
            />
            {resetForm.formState.errors.password && (
              <p className="text-[10px] text-red-400 font-light">{resetForm.formState.errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Confirm Password
            </label>
            <input
              {...resetForm.register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
            />
            {resetForm.formState.errors.confirmPassword && (
              <p className="text-[10px] text-red-400 font-light">{resetForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Submit Step 2 */}
          <button
            type="submit"
            disabled={loading || successMsg === 'Password has been reset successfully!'}
            className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center space-x-2 transition-all shadow-lg glow-primary active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <KeyRound className="w-4.5 h-4.5" />
                <span>Save New Password</span>
              </>
            )}
          </button>
        </form>
      )}

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground font-light">
          Remembered your password?{' '}
          <Link to="/login" className="text-blue-400 hover:underline font-normal">
            Return to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
