import {
    ArrowRight,
    Bell,
    Building2,
    CalendarDays,
    Download,
    FileText,
    Mail,
    Phone,
    ShieldCheck,
    Waves
} from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Container,
    Field,
    PageHeader,
    SearchBox,
    SectionHeader,
    StatCard,
    TextArea,
    TextInput,
    TextLink
} from './design-system';

const sampleLinks = [
    'Hydraulic Model Studies',
    'Tender Notices',
    'Training Schedules',
    'Research Publications'
];

export default function App() {
    return (
        <main className="min-h-screen bg-page-bg">
            <Container>
                <PageHeader
                    eyebrow="IRI Design System"
                    title="Modern government website foundation"
                    description="Reusable React and Tailwind UI primitives for the Irrigation Research Institute website, built around accessible typography, spacing, cards, buttons, links, forms, and status states."
                    actions={(
                        <>
                            <Button icon={FileText}>Primary Action</Button>
                            <Button as="a" href="#components" icon={ArrowRight} iconPosition="right" variant="secondary">
                                View Components
                            </Button>
                        </>
                    )}
                />

                <section className="grid gap-6 pb-10 lg:grid-cols-3" aria-labelledby="overview-heading">
                    <div className="lg:col-span-2">
                        <Card
                            icon={Building2}
                            title="Government Portal Surface"
                            description="A calm, readable structure for public information and administrative workflows."
                            className="h-full"
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Alert title="Accessible by default">
                                    Focus styles, strong contrast, semantic labels, and keyboard-friendly controls are part of the base system.
                                </Alert>
                                <Alert variant="success" title="UI only">
                                    This layer does not change backend routes, API calls, authentication, or data schema.
                                </Alert>
                            </div>
                            <div className="mt-6 flex flex-wrap gap-3">
                                <Badge icon={ShieldCheck}>Primary Blue #0F4C81</Badge>
                                <Badge icon={Waves}>8px spacing system</Badge>
                                <Badge icon={CalendarDays}>200ms transitions</Badge>
                            </div>
                        </Card>
                    </div>

                    <Card title="Quick Links" icon={Bell}>
                        <ul className="grid gap-3">
                            {sampleLinks.map((link) => (
                                <li key={link}>
                                    <TextLink href="#components">{link}</TextLink>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </section>

                <section className="pb-10" id="components" aria-labelledby="components-heading">
                    <SectionHeader
                        title="Reusable Components"
                        description="These components encode the requested design tokens and are ready to apply to existing pages without changing functionality."
                        action={<Button icon={Download} variant="secondary">Export</Button>}
                    />

                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                        <StatCard icon={FileText} label="Card Radius" value="16px" helper="Soft border and shadow" />
                        <StatCard icon={CalendarDays} label="Page Title" value="36px" helper="Inter Extra Bold" />
                        <StatCard icon={Phone} label="Body Text" value="16px" helper="Comfortable line height" />
                        <StatCard icon={Mail} label="Small Text" value="14px" helper="Labels and metadata" />
                    </div>
                </section>

                <section className="grid gap-6 pb-12 lg:grid-cols-[1fr_0.8fr]" aria-labelledby="forms-heading">
                    <Card title="Form Elements" description="Accessible labels, focus rings, borders, and error slots.">
                        <form className="grid gap-4">
                            <SearchBox id="notice-search" label="Search notices" placeholder="Search tenders, announcements, reports..." />
                            <Field id="title" label="Notice title" hint="Use clear public-facing language.">
                                <TextInput id="title" placeholder="Example: Training schedule published" />
                            </Field>
                            <Field id="message" label="Message">
                                <TextArea id="message" placeholder="Write the announcement content..." />
                            </Field>
                            <div className="flex flex-wrap gap-3 pt-2">
                                <Button type="button">Save</Button>
                                <Button type="button" variant="secondary">Cancel</Button>
                            </div>
                        </form>
                    </Card>

                    <Card title="Status States" description="Shared visual language for feedback.">
                        <div className="grid gap-4">
                            <Alert title="Information">Use for neutral updates and guidance.</Alert>
                            <Alert variant="success" title="Success">Use after content is saved or published.</Alert>
                            <Alert variant="danger" title="Danger">Use for errors, delete warnings, and failed requests.</Alert>
                        </div>
                    </Card>
                </section>
            </Container>
        </main>
    );
}
