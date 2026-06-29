import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ExternalLink,
    Info,
    Search
} from 'lucide-react';

const cx = (...classes) => classes.filter(Boolean).join(' ');

export function Container({ as: Component = 'div', className, children, ...props }) {
    return (
        <Component className={cx('ds-container', className)} {...props}>
            {children}
        </Component>
    );
}

export function PageHeader({ eyebrow, title, description, actions, className }) {
    return (
        <div className={cx('ds-slide-up py-8 md:py-10', className)}>
            {eyebrow ? <Badge icon={Info}>{eyebrow}</Badge> : null}
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                    <h1 className="ds-page-title">{title}</h1>
                    {description ? <p className="ds-text mt-3 max-w-3xl">{description}</p> : null}
                </div>
                {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
            </div>
        </div>
    );
}

export function SectionHeader({ title, description, action, className }) {
    return (
        <div className={cx('mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
            <div>
                <h2 className="ds-section-heading">{title}</h2>
                {description ? <p className="ds-text mt-2 max-w-2xl">{description}</p> : null}
            </div>
            {action ? <div className="flex shrink-0">{action}</div> : null}
        </div>
    );
}

export function Card({ as: Component = 'article', title, description, icon: Icon, className, children, ...props }) {
    return (
        <Component className={cx('ds-card ds-fade', className)} {...props}>
            {(title || description || Icon) ? (
                <div className="mb-4 flex items-start gap-3">
                    {Icon ? (
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary-blue">
                            <Icon aria-hidden="true" size={22} strokeWidth={2} />
                        </span>
                    ) : null}
                    <div>
                        {title ? <h3 className="ds-card-title">{title}</h3> : null}
                        {description ? <p className="ds-small-text mt-1">{description}</p> : null}
                    </div>
                </div>
            ) : null}
            {children}
        </Component>
    );
}

export function Button({
    as: Component = 'button',
    variant = 'primary',
    icon: Icon,
    iconPosition = 'left',
    className,
    children,
    ...props
}) {
    const variantClass = variant === 'secondary' ? 'ds-button-secondary' : 'ds-button-primary';
    const iconElement = Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2} /> : null;

    return (
        <Component className={cx('ds-button', variantClass, className)} {...props}>
            {iconPosition === 'left' ? iconElement : null}
            <span>{children}</span>
            {iconPosition === 'right' ? iconElement : null}
        </Component>
    );
}

export function TextLink({ href, external = false, className, children, ...props }) {
    return (
        <a
            className={cx('ds-link inline-flex items-center gap-1', className)}
            href={href}
            rel={external ? 'noopener noreferrer' : undefined}
            target={external ? '_blank' : undefined}
            {...props}
        >
            <span>{children}</span>
            {external ? <ExternalLink aria-hidden="true" size={16} /> : null}
        </a>
    );
}

export function Badge({ icon: Icon, className, children }) {
    return (
        <span className={cx('ds-badge', className)}>
            {Icon ? <Icon aria-hidden="true" size={15} strokeWidth={2} /> : null}
            <span>{children}</span>
        </span>
    );
}

export function Alert({ variant = 'info', title, children, className }) {
    const isSuccess = variant === 'success';
    const isDanger = variant === 'danger';
    const Icon = isSuccess ? CheckCircle2 : isDanger ? AlertCircle : Info;
    const colorClass = isSuccess
        ? 'border-success/25 bg-green-50 text-success'
        : isDanger
            ? 'border-danger/25 bg-red-50 text-danger'
            : 'border-secondary-blue/25 bg-blue-50 text-primary-blue';

    return (
        <div className={cx('rounded-2xl border p-4', colorClass, className)} role="status">
            <div className="flex gap-3">
                <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
                <div>
                    {title ? <p className="font-semibold">{title}</p> : null}
                    {children ? <div className="mt-1 text-sm leading-6 text-slate-700">{children}</div> : null}
                </div>
            </div>
        </div>
    );
}

export function Field({ label, id, hint, error, children }) {
    return (
        <div>
            <label className="ds-label" htmlFor={id}>
                {label}
            </label>
            {children}
            {hint && !error ? <p className="ds-small-text mt-2">{hint}</p> : null}
            {error ? <p className="mt-2 text-sm font-medium leading-6 text-danger">{error}</p> : null}
        </div>
    );
}

export function TextInput({ id, className, ...props }) {
    return <input className={cx('ds-input', className)} id={id} {...props} />;
}

export function TextArea({ id, className, ...props }) {
    return <textarea className={cx('ds-input min-h-32 resize-y', className)} id={id} {...props} />;
}

export function SearchBox({ label = 'Search', id = 'search', className, ...props }) {
    return (
        <Field id={id} label={label}>
            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <TextInput className={cx('pl-10', className)} id={id} type="search" {...props} />
            </div>
        </Field>
    );
}

export function StatCard({ label, value, helper, icon: Icon = ArrowRight }) {
    return (
        <Card className="transition-transform duration-200 hover:scale-[1.01]">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="ds-small-text font-semibold uppercase tracking-wide">{label}</p>
                    <p className="mt-2 text-3xl font-extrabold leading-10 text-primary-blue">{value}</p>
                    {helper ? <p className="ds-small-text mt-1">{helper}</p> : null}
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-secondary-blue">
                    <Icon aria-hidden="true" size={22} strokeWidth={2} />
                </span>
            </div>
        </Card>
    );
}
