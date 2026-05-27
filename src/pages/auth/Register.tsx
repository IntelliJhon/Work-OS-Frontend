import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../services/api/client';
import { ShieldAlert, UserPlus } from 'lucide-react';
import axios from 'axios';

const registerSchema = z
  .object({
    companyName: z.string().min(2, 'Company name must be at least 2 characters'),
    slug: z
      .string()
      .min(3, 'Workspace slug must be at least 3 characters')
      .max(63, 'Workspace slug must be at most 63 characters')
      .regex(/^[a-z0-9-]+$/, 'Workspace slug can only contain lowercase letters, numbers, and hyphens')
      .refine((val) => !val.startsWith('-') && !val.endsWith('-'), 'Workspace slug cannot start or end with a hyphen'),
    ownerName: z.string().min(2, 'Owner name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: '',
      slug: '',
      ownerName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await apiClient.post('/tenants/create', {
        companyName: data.companyName.trim(),
        slug: data.slug.trim().toLowerCase(),
        ownerName: data.ownerName.trim(),
        email: data.email.trim(),
        password: data.password,
      });

      const { tenant, user, accessToken, refreshToken } = response.data;
      
      // Inject tenantId inside the user object before storing it
      const userProfile = {
        ...user,
        tenantId: tenant.id,
      };

      loginStore(userProfile, accessToken, refreshToken);
      navigate('/dashboard');
    } catch (err) {
      console.error('[Register] Onboarding failed', err);
      let errMsg = 'Workspace onboarding failed. Please try again.';
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
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">Create Workspace</h2>
        <p className="text-xs text-muted-foreground font-light">
          Onboard your tenant organization and administrator account
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
          <span className="font-light">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
        {/* Company Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Company Name
          </label>
          <input
            {...register('companyName')}
            placeholder="e.g. Acme Corporation"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.companyName && (
            <p className="text-[10px] text-red-400 font-light">{errors.companyName.message}</p>
          )}
        </div>

        {/* Workspace Slug */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Workspace Slug (Subdomain)
          </label>
          <input
            {...register('slug')}
            placeholder="e.g. acme-corp"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.slug && (
            <p className="text-[10px] text-red-400 font-light">{errors.slug.message}</p>
          )}
        </div>

        {/* Owner Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Owner Full Name
          </label>
          <input
            {...register('ownerName')}
            placeholder="e.g. Jane Doe"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.ownerName && (
            <p className="text-[10px] text-red-400 font-light">{errors.ownerName.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Owner Email
          </label>
          <input
            {...register('email')}
            type="email"
            placeholder="admin@company.com"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.email && (
            <p className="text-[10px] text-red-400 font-light">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Password
          </label>
          <input
            {...register('password')}
            type="password"
            placeholder="Min 8 chars, 1 uppercase, 1 digit"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.password && (
            <p className="text-[10px] text-red-400 font-light">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
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
              <span>Onboard Organization</span>
              <UserPlus className="w-4.5 h-4.5" />
            </>
          )}
        </button>
      </form>

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground font-light">
          Already have a workspace?{' '}
          <Link to="/login" className="text-blue-400 hover:underline font-normal">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Register;
