import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import styles from './LandingPage.module.css';
import { CheckCircle2, ChevronRight, Globe, MapPin, ArrowUpRight, Send, Instagram, Youtube } from 'lucide-react';
import api from '@/lib/axios';

const SOCIAL_LINKS = {
    telegram: 'https://t.me/satislomxon',
    instagram: 'https://instagram.com/satplatform_uz',
    youtube: 'https://youtube.com/@satplatform_uz',
};

const SocialIcons = ({ className = '' }: { className?: string }) => (
    <div className={className} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <a href={SOCIAL_LINKS.telegram} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', transition: 'color 0.2s' }}>
            <Send size={20} />
        </a>
        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', transition: 'color 0.2s' }}>
            <Instagram size={20} />
        </a>
        <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', transition: 'color 0.2s' }}>
            <Youtube size={20} />
        </a>
    </div>
);

const LandingPage = () => {
    const { data: stats } = useQuery({
        queryKey: ['public-stats'],
        queryFn: async () => {
            const res = await api.get('/analytics/public/stats');
            return res.data;
        },
        staleTime: 5 * 60 * 1000,
    });

    return (
        <div className={styles.container}>

            {/* Custom Navbar */}
            <nav className={styles.nav}>
                <Link to="/" className={styles.logo}>
                    SAT<span>Platform</span>
                </Link>
                <div className={styles.navLinks}>
                    <a href="#about">Biz haqimizda</a>
                    <a href="#results">Natijalar</a>
                    <a href="#courses">Kurslar</a>
                    <SocialIcons />
                    <Link to="/login">Kirish</Link>
                    <Link to="/register" className={styles.button}>
                        Ro'yxatdan o'tish
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className={styles.heroSection}>
                <div className={styles.glowBlob} style={{ top: '0', right: '-10%' }}></div>
                <div className={styles.glowBlob} style={{ bottom: '0', left: '-10%', background: 'radial-gradient(circle, rgba(120, 50, 255, 0.3) 0%, transparent 70%)' }}></div>

                <div className={styles.section}>
                    <h1 className={styles.heroTitle}>
                        Kelajagingizni <br />
                        Biz Bilan Quring.
                    </h1>
                    <p className={styles.heroSubtitle}>
                        Islomxon Saidov jamoasi bilan SAT imtihoniga tayyorlaning.
                        Oddiy kurslar emas, haqiqiy natija va yuqori sifatli ta'lim.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <Link to="/register" className={`${styles.button} ${styles.buttonPrimary}`}>
                            Boshlash <ChevronRight size={20} />
                        </Link>
                        <Link to="/login" className={`${styles.button} ${styles.buttonOutline}`}>
                            Platformaga Kirish
                        </Link>
                    </div>
                </div>
            </section>

            {/* Infinite Stats Ticker */}
            <div className={styles.tickerWrap}>
                <div className={styles.ticker}>
                    {[1, 2].map((i) => (
                        <React.Fragment key={i}>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>{stats?.total_users ?? '500+'}</span>
                                <span className={styles.tickerLabel}>Foydalanuvchilar</span>
                            </div>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>{stats?.tests_completed ?? '1000+'}</span>
                                <span className={styles.tickerLabel}>Testlar Yakunlangan</span>
                            </div>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>{stats?.avg_score ? Math.round(stats.avg_score) : '1400+'}</span>
                                <span className={styles.tickerLabel}>O'rtacha Ball</span>
                            </div>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>53</span>
                                <span className={styles.tickerLabel}>SAT 1400+ / 1600</span>
                            </div>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>10</span>
                                <span className={styles.tickerLabel}>SAT Math 800 / 800</span>
                            </div>
                            <div className={styles.tickerItem}>
                                <span className={styles.tickerValue}>156</span>
                                <span className={styles.tickerLabel}>SAT Math 750+ / 800</span>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Why Us Section */}
            <section className={styles.section} id="about">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '4rem', alignItems: 'center' }}>
                    <div>
                        <h2 className={styles.sectionTitle}>Nega Aynan Biz?</h2>
                        <p className={styles.sectionDesc}>
                            Bizning metodika yillar davomida sinovdan o'tgan va yuzlab o'quvchilarni top universitetlarga olib kirgan.
                        </p>
                        <div className={styles.grid} style={{ gridTemplateColumns: '1fr' }}>
                            <div className={styles.featureCard} style={{ padding: '2rem' }}>
                                <ArrowUpRight size={32} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
                                <h3>Jonli Darslar</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Har bir dars interaktiv shaklda o'tiladi.</p>
                            </div>
                            <div className={styles.featureCard} style={{ padding: '2rem' }}>
                                <CheckCircle2 size={32} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
                                <h3>Individual Yondashuv</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>O'quvchining kuchli va kuchsiz tomonlari tahlil qilinadi.</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        {/* Placeholder for uploaded_image_0 (Teacher/Team photo) */}
                        <div className={styles.imagePlaceholder} style={{ aspectRatio: '4/5', transform: 'rotate(2deg)' }}>
                            [Rasm: Jamoa va O'quvchilar]
                        </div>
                    </div>
                </div>
            </section>

            {/* Courses Section */}
            <section className={styles.section} id="courses">
                <h2 className={styles.sectionTitle}>O'quv Dasturlari</h2>
                <div className={styles.courseGrid}>
                    {/* Online Course */}
                    <div className={styles.courseCard}>
                        <div>
                            <Globe size={40} color="var(--accent-color)" style={{ marginBottom: '1.5rem' }} />
                            <h3 className={styles.courseCardTitle}>Online Kurs</h3>
                            <ul className={styles.courseCardList}>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> Telegram Platformasida Jonli Darslar</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> +300 Video Darslar</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> +100 Amaliy Testlar</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> Erkin Grafik & 24/7 Support</li>
                            </ul>
                        </div>
                        <button className={styles.cardButton}>
                            Batafsil Ma'lumot
                        </button>
                    </div>

                    {/* Offline Course */}
                    <div className={styles.courseCard}>
                        <div>
                            <MapPin size={40} color="var(--accent-color)" style={{ marginBottom: '1.5rem' }} />
                            <h3 className={styles.courseCardTitle}>Offline Kurs</h3>
                            <ul className={styles.courseCardList}>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> New Uzbekistan University Binosida</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> Ustoz bilan yuzma-yuz muloqot</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> #1 Jonli Darslar va Mock Testlar</li>
                                <li><CheckCircle2 size={20} color="var(--accent-color)" /> Raqobatbardosh Muhit</li>
                            </ul>
                        </div>
                        <button className={styles.cardButton}>
                            Kursga Yozilish
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ borderTop: '1px solid var(--card-border)', padding: '4rem 0', marginTop: '4rem' }}>
                <div className={styles.section} style={{ padding: '0 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem' }}>
                        <div>
                            <div className={styles.logo} style={{ marginBottom: '1rem', display: 'block' }}>SAT<span>Platform</span></div>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: '300px' }}>
                                O'zbekistonning eng ishonchli SAT tayyorlov markazi.
                            </p>
                            <div style={{ marginTop: '2rem' }}>
                                <SocialIcons />
                            </div>
                        </div>
                        <div>
                            <h4 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Bog'lanish</h4>
                            <p style={{ color: 'var(--text-secondary)' }}>+998 90 123 45 67</p>
                            <p style={{ color: 'var(--text-secondary)' }}>info@satplatform.uz</p>
                        </div>
                    </div>
                    <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--card-border)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        © 2024 Islomxon Saidov SAT Platform.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
