import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';
import './Login.scss';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // No minimum-length rule here on purpose: this is a sign-in form, so the server
  // decides whether a password is valid. Enforcing 6 characters locally locked out
  // any existing account with a shorter one, behind a message that blamed the
  // password's length rather than saying it was wrong.
  const validate = () => {
    const errs = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(trimmedEmail)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    return errs;
  };

  // Clear the error the moment the user starts fixing it.
  const onEmailChange = (e) => {
    setEmail(e.target.value);
    if (errors.email || errors.form) setErrors((p) => ({ ...p, email: null, form: null }));
  };

  const onPasswordChange = (e) => {
    setPassword(e.target.value);
    if (errors.password || errors.form) setErrors((p) => ({ ...p, password: null, form: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      // Trimmed: the server matches the address exactly, so a trailing space from
      // autofill would fail a perfectly valid login with no way to see why.
      const userData = await login(email.trim(), password);
      toast.success('Welcome back!');

      // Role-based redirect
      if (userData.role === ROLES.SUPER_ADMIN) {
        navigate('/', { replace: true });
      } else if (userData.role === ROLES.INSURANCE_PROVIDER) {
        navigate('/claim-list', { replace: true });
      } else {
        navigate('/pre-auth', { replace: true });
      }
    } catch (err) {
      // No response at all — server down, DNS, CORS. Distinguish it, because
      // "Incorrect password" would be a lie and would send the user in circles.
      if (!err?.response) {
        setErrors({ form: 'Cannot reach the server. Please check your connection and try again.' });
        return;
      }
      const detail = err.response.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join(', ')
            : 'Unable to sign in. Please try again.';
      // The server names which field is wrong, so show it against that field.
      if (/password/i.test(message)) setErrors({ password: message });
      else if (/email|account/i.test(message)) setErrors({ email: message });
      else setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__header">
          <h1 className="login__logo">OASYS</h1>
          <p className="login__subtitle">Sign in to your account</p>
        </div>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          {errors.form && (
            <div className="login__error" role="alert">
              {errors.form}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={onEmailChange}
              className={errors.email ? 'input--error' : ''}
              aria-invalid={!!errors.email}
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={onPasswordChange}
              className={errors.password ? 'input--error' : ''}
              aria-invalid={!!errors.password}
            />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <button type="submit" className="login__btn" disabled={loading}>
            {loading ? <Spinner size={20} /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
