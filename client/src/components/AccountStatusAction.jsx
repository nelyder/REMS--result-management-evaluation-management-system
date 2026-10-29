import { useState } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { Button, ConfirmDialog } from './ui/index.js';
import { usersService } from '../services/index.js';
import { useToast } from '../contexts/ToastContext.jsx';

/** Activate / deactivate an account (admin only; enforced by the API). */
export function AccountStatusAction({ profileId, name, status, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const active = status === 'active';

  const confirm = async () => {
    setLoading(true);
    try {
      await usersService.setStatus(profileId, active ? 'inactive' : 'active');
      toast.success(`${name} ${active ? 'deactivated' : 'reactivated'}.`);
      setOpen(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={active ? `Deactivate ${name}` : `Reactivate ${name}`}
        title={active ? 'Deactivate account' : 'Reactivate account'}
      >
        {active ? <UserX className="h-4 w-4 text-amber-600" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        loading={loading}
        tone={active ? 'danger' : 'primary'}
        title={active ? 'Deactivate account?' : 'Reactivate account?'}
        confirmLabel={active ? 'Deactivate' : 'Reactivate'}
        message={
          active
            ? `${name} will be signed out and unable to sign in until reactivated. Their academic records are kept.`
            : `${name} will be able to sign in again.`
        }
      />
    </>
  );
}
