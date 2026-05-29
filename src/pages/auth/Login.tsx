import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../services/api/client';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import axios from 'axios';

const loginSchema = z.object({
  workspace: z.string().min(3, 'Workspace slug must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Premium transition states
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [transitionStep, setTransitionStep] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      workspace: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await apiClient.post('/auth/login', {
        workspace: data.workspace.trim(),
        email: data.email.trim(),
        password: data.password,
      });

      const { accessToken, refreshToken, user } = response.data;

      // Launch the premium visual transition
      setIsTransitioning(true);
      setTransitionProgress(0);

      const steps = [
        "Connecting to workspace...",
        "Authenticating credentials...",
        "Setting up secure session...",
        "Syncing project workspace streams...",
        "Welcome to WorkOS!"
      ];

      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 2;
        setTransitionProgress(currentProgress);

        if (currentProgress < 20) setTransitionStep(steps[0]);
        else if (currentProgress < 40) setTransitionStep(steps[1]);
        else if (currentProgress < 65) setTransitionStep(steps[2]);
        else if (currentProgress < 90) setTransitionStep(steps[3]);
        else setTransitionStep(steps[4]);

        if (currentProgress >= 100) {
          clearInterval(interval);
          loginStore(user, accessToken, refreshToken);
          navigate('/dashboard');
        }
      }, 25);

    } catch (err) {
      console.error('[Login] Error during authentication', err);
      let errMsg = 'Invalid workspace or credentials';
      if (axios.isAxiosError(err)) {
        errMsg = err.response?.data?.error || errMsg;
      }
      setErrorMsg(errMsg);
      setLoading(false);
    }
  };

  if (isTransitioning) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#070b19] text-slate-900 dark:text-white transition-all duration-300">
        {/* Soft floating background glows */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-[150px] animate-pulse duration-[10000ms]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-[150px] animate-pulse duration-[8000ms]" />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
          {/* Brand Logo with pulse/bounce */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl glow-primary animate-bounce mb-8">
            <span className="font-bold text-white text-4xl tracking-wider select-none">W</span>
          </div>

          {/* Loader text */}
          <div className="space-y-2 h-14">
            <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white/90 drop-shadow-md transition-all duration-300">
              {transitionStep}
            </h3>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-mono tracking-wider">
              {transitionProgress}% Complete
            </p>
          </div>

          {/* Progress bar container */}
          <div className="w-full h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden border border-slate-300/40 dark:border-white/5 shadow-inner mt-8">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-[75ms] ease-out shadow-[0_0_12px_rgba(59,130,246,0.8)]"
              style={{ width: `${transitionProgress}%` }}
            />
          </div>

          <div className="mt-12 flex items-center space-x-2 text-[10px] text-slate-500 dark:text-muted-foreground/60 tracking-widest uppercase">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
            <span>Secured by SSL & RBAC</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">Welcome Back</h2>
        <p className="text-xs text-muted-foreground font-light">
          Enter your workspace details and email credentials
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <ShieldAlert className="w-4.5 h-4.5 shrink-0" />
          <span className="font-light">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Workspace Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Workspace Slug
          </label>
          <input
            {...register('workspace')}
            placeholder="e.g. acme-corp"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.workspace && (
            <p className="text-[10px] text-red-400 font-light">{errors.workspace.message}</p>
          )}
        </div>

        {/* Email Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Email Address
          </label>
          <input
            {...register('email')}
            type="email"
            placeholder="name@company.com"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.email && (
            <p className="text-[10px] text-red-400 font-light">{errors.email.message}</p>
          )}
        </div>

        {/* Password Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Password
            </label>
            <Link to="/forgot-password" className="text-[10px] text-blue-400 hover:underline font-light">
              Forgot Password?
            </Link>
          </div>
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white glass-input bg-card focus:outline-none"
          />
          {errors.password && (
            <p className="text-[10px] text-red-400 font-light">{errors.password.message}</p>
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
              <span>Sign In to Workspace</span>
              <ArrowRight className="w-4.5 h-4.5" />
            </>
          )}
        </button>
      </form>

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground font-light">
          Don't have a workspace?{' '}
          <Link to="/register" className="text-blue-400 hover:underline font-normal">
            Create new tenant
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Login;
