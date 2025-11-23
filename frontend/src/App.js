// client/src/App.js - TOUT LE FRONTEND EN UN SEUL FICHIER (FINAL V8 - STABLE)

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { 
    Container, Nav, Navbar, Button, Card, Row, Col, 
    Form, Alert, ListGroup, InputGroup, Modal, Badge
} from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react'; 
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


// 🎯 L'API_URL DOIT pointer vers votre backend hébergé.
const API_URL = 'https://form-backend-pl5d.onrender.com/api'; 


// --- PARTIE 1 : AUTHENTIFICATION (LOGIN/REGISTER) ---
const Auth = ({ onAuthSuccess, apiUrl }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const endpoint = isLogin ? 'login' : 'register';
        const data = isLogin ? { email, password } : { email, password, companyName };

        try {
            const response = await axios.post(`${apiUrl}/auth/${endpoint}`, data);
            onAuthSuccess(response.data.token, response.data.user);
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'authentification.');
        }
    };

    return (
        <Card className="shadow-lg p-4 mx-auto mt-5" style={{ maxWidth: '450px' }}>
            <Card.Title className="text-center mb-4">{isLogin ? 'Connexion' : 'Inscription'}</Card.Title>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form onSubmit={handleSubmit}>
                {!isLogin && (
                    <Form.Group className="mb-3">
                        <Form.Label>Nom de l'entreprise</Form.Label>
                        <Form.Control 
                            type="text" 
                            placeholder="Entrez le nom de votre entreprise" 
                            value={companyName} 
                            onChange={(e) => setCompanyName(e.target.value)} 
                            required={!isLogin}
                        />
                    </Form.Group>
                )}
                <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control 
                        type="email" 
                        placeholder="Entrez votre email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Mot de passe</Form.Label>
                    <Form.Control 
                        type="password" 
                        placeholder="Mot de passe" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100 mt-3">
                    {isLogin ? 'Se connecter' : 'S\'inscrire'}
                </Button>
            </Form>
            <hr />
            <Button variant="link" onClick={() => setIsLogin(!isLogin)} className="text-center">
                {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </Button>
        </Card>
    );
};


// --- PARTIE 2 : ÉDITION ET CRÉATION DE FORMULAIRE ---
const FormEditor = ({ initialForm, onSaveSuccess, apiUrl, token }) => {
    const [form, setForm] = useState(initialForm || { title: 'Nouveau Formulaire', fields: [], logoPath: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveMessage, setSaveMessage] = useState('');
    const [logoPreview, setLogoPreview] = useState(form.logoPath);
    
    // Pour l'aperçu du QR Code
    const [modalShow, setModalShow] = useState(false);
    const [publicUrl, setPublicUrl] = useState('');
    const [qrCodeDataURL, setQrCodeDataURL] = useState('');

    useEffect(() => {
        setLogoPreview(form.logoPath);
    }, [form.logoPath]);

    const handleFieldChange = (index, key, value) => {
        const newFields = form.fields.map((field, i) => (
            i === index ? { ...field, [key]: value } : field
        ));
        setForm({ ...form, fields: newFields });
    };

    const addField = () => {
        setForm({ 
            ...form, 
            fields: [...form.fields, { label: `Question ${form.fields.length + 1}`, type: 'text' }] 
        });
    };

    const removeField = (index) => {
        setForm({ ...form, fields: form.fields.filter((_, i) => i !== index) });
    };

    const handleLogoUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64Data = reader.result;
            setLogoPreview(base64Data);
            setForm({...form, logoPath: base64Data});
        };
        reader.readAsDataURL(file);
    };


    const saveForm = async () => {
        setIsSaving(true);
        setSaveError('');
        setSaveMessage('');

        // 1. Sauvegarde du formulaire (y compris le logo en base64)
        try {
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            const dataToSend = { ...form };
            
            const response = await axios.post(`${apiUrl}/forms`, dataToSend, config);

            // 2. Mise à jour de l'état local et affichage du message de succès
            setForm(response.data.form);
            setPublicUrl(response.data.publicUrl);
            setQrCodeDataURL(response.data.qrCodeDataURL);
            setSaveMessage(form._id ? 'Formulaire mis à jour avec succès !' : 'Formulaire créé avec succès !');
            
            // Appeler la fonction de succès du parent pour mettre à jour la liste
            onSaveSuccess();

        } catch (err) {
            setSaveError(err.response?.data?.message || 'Erreur lors de la sauvegarde du formulaire.');
        } finally {
            setIsSaving(false);
        }
    };
    
    // Composant Modal pour le QR Code
    const QRCodeModal = (props) => (
        <Modal {...props} size="lg" aria-labelledby="contained-modal-title-vcenter" centered>
            <Modal.Header closeButton>
                <Modal.Title id="contained-modal-title-vcenter">
                    Lien Public et QR Code
                </Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
                <h5>Lien Public de votre Formulaire :</h5>
                <InputGroup className="mb-3">
                    <Form.Control
                        defaultValue={publicUrl}
                        readOnly
                        onClick={(e) => e.target.select()}
                    />
                    <Button variant="outline-secondary" onClick={() => navigator.clipboard.writeText(publicUrl)}>
                        Copier
                    </Button>
                </InputGroup>
                <div className="mt-4">
                    <QRCodeSVG 
                        value={publicUrl} 
                        size={256} 
                        level={"H"} 
                        includeMargin={true}
                    />
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={props.onHide}>Fermer</Button>
            </Modal.Footer>
        </Modal>
    );

    return (
        <>
            <Row className="mb-4">
                <Col>
                    <h2 className="mb-0">{form._id ? 'Éditer le Formulaire' : 'Créer un Nouveau Formulaire'}</h2>
                    {publicUrl && (
                        <Button variant="info" className="mt-2" onClick={() => setModalShow(true)}>
                            Voir Lien Public & QR Code
                        </Button>
                    )}
                </Col>
            </Row>

            {saveMessage && <Alert variant="success">{saveMessage}</Alert>}
            {saveError && <Alert variant="danger">{saveError}</Alert>}
            
            <Card className="shadow-sm mb-4">
                <Card.Body>
                    <Form.Group className="mb-3">
                        <Form.Label>Titre du Formulaire</Form.Label>
                        <Form.Control 
                            type="text" 
                            value={form.title} 
                            onChange={(e) => setForm({ ...form, title: e.target.value })} 
                        />
                    </Form.Group>

                    {/* Section Logo */}
                    <div className="mb-3">
                        <Form.Label>Logo du Formulaire (Optionnel)</Form.Label>
                        <Form.Control type="file" onChange={handleLogoUpload} accept="image/*" className="mb-2" />
                        {logoPreview && (
                            <div className="mt-2 text-center">
                                <img src={logoPreview} alt="Aperçu du Logo" style={{ maxWidth: '100px', maxHeight: '100px', border: '1px solid #ccc' }} />
                                {/* 💡 CORRECTION SYNTAXE : Utilisation correcte de la fonction de nettoyage */}
                                <Button variant="link" size="sm" onClick={() => { setLogoPreview(''); setForm({...form, logoPath: ''}); }}>Retirer</Button>
                            </div>
                        )}
                    </div>
                </Card.Body>
            </Card>

            <h4 className="mt-4">Champs du Formulaire</h4>
            {form.fields.map((field, index) => (
                <Card key={index} className="mb-3 shadow-sm border-left-primary">
                    <Card.Body>
                        <Row className="align-items-center">
                            <Col xs={1} className="text-center text-muted">{index + 1}.</Col>
                            <Col md={5}>
                                <Form.Control
                                    type="text"
                                    placeholder="Libellé du champ"
                                    value={field.label}
                                    onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                                />
                            </Col>
                            <Col md={4}>
                                <Form.Select
                                    value={field.type}
                                    onChange={(e) => handleFieldChange(index, 'type', e.target.value)}
                                >
                                    <option value="text">Texte Court</option>
                                    <option value="textarea">Texte Long</option>
                                    <option value="email">Email</option>
                                    <option value="number">Nombre</option>
                                    <option value="checkbox">Case à cocher</option>
                                </Form.Select>
                            </Col>
                            <Col md={2} className="text-end">
                                <Button variant="danger" size="sm" onClick={() => removeField(index)}>Supprimer</Button>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>
            ))}

            <Button variant="outline-primary" onClick={addField} className="mt-3 mb-4">
                + Ajouter un Champ
            </Button>
            
            <div className="text-center">
                <Button variant="success" size="lg" onClick={saveForm} disabled={isSaving}>
                    {isSaving ? 'Sauvegarde en cours...' : 'Sauvegarder le Formulaire'}
                </Button>
            </div>
            
            {publicUrl && (
                <QRCodeModal
                    show={modalShow}
                    onHide={() => setModalShow(false)}
                />
            )}
        </>
    );
};


// --- PARTIE 3 : DASHBOARD (LISTE ET NAVIGATION) ---
const Dashboard = ({ user, apiUrl, token, navigateToEditForm, navigateToStats }) => {
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchForms = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            const response = await axios.get(`${apiUrl}/forms`, config);
            setForms(response.data);
        } catch (err) {
            setError('Erreur lors du chargement des formulaires.');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, token]);

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    return (
        <>
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1>Dashboard</h1>
                    <p className="lead">Gérez vos formulaires et consultez les statistiques.</p>
                </Col>
                <Col className="text-end">
                    <Button variant="primary" onClick={() => navigateToEditForm(null)}>
                        + Créer Nouveau Formulaire
                    </Button>
                </Col>
            </Row>

            {loading && <p>Chargement des formulaires...</p>}
            {error && <Alert variant="danger">{error}</Alert>}

            {!loading && forms.length === 0 && (
                <Alert variant="info">Vous n'avez pas encore créé de formulaires. Créez-en un pour commencer !</Alert>
            )}

            <ListGroup>
                {forms.map(form => (
                    <ListGroup.Item key={form._id} className="d-flex justify-content-between align-items-center shadow-sm mb-2">
                        <div className="me-auto">
                            <h5>{form.title}</h5>
                            <small className="text-muted">Créé le : {new Date(form.createdAt).toLocaleDateString()}</small>
                        </div>
                        <Badge bg="success" className="me-3">
                            Soumissions: {form.submissions}
                        </Badge>
                        <Button 
                            variant="outline-secondary" 
                            size="sm" 
                            className="me-2" 
                            onClick={() => navigateToEditForm(form._id)}
                        >
                            Éditer
                        </Button>
                        <Button 
                            variant="primary" 
                            size="sm"
                            onClick={() => navigateToStats(form._id)}
                        >
                            Statistiques
                        </Button>
                    </ListGroup.Item>
                ))}
            </ListGroup>
        </>
    );
};


// --- PARTIE 4 : STATISTIQUES ET RÉSULTATS ---
const FormStats = ({ formId, apiUrl, token, navigate }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Pour l'affichage du QR Code
    const [modalShow, setModalShow] = useState(false);
    const [publicUrl, setPublicUrl] = useState('');
    const [qrCodeDataURL, setQrCodeDataURL] = useState('');

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            // Récupère les stats ET les détails du formulaire (pour le lien public)
            const statsResponse = await axios.get(`${apiUrl}/forms/${formId}/stats`, config);
            setStats(statsResponse.data);
            
            // Re-fetch des détails complets pour générer le lien et QR Code (si nécessaire)
            const formResponse = await axios.post(`${apiUrl}/forms`, { _id: formId, title: statsResponse.data.title, fields: [] }, config);
            setPublicUrl(formResponse.data.publicUrl);
            setQrCodeDataURL(formResponse.data.qrCodeDataURL);
            
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors du chargement des statistiques.');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, token, formId]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (loading) return <div className="text-center mt-5">Chargement des statistiques...</div>;
    if (error) return <Alert variant="danger" className="mt-5">{error}</Alert>;
    if (!stats) return <div className="text-center mt-5">Aucune donnée disponible.</div>;
    
    // Préparation des données pour le graphique de soumissions
    const submissionData = stats.submissions.map(sub => ({
        name: new Date(sub.submittedAt).toLocaleTimeString(), // Utilise l'heure de soumission
        Soumissions: 1,
    }));


    const QRCodeModal = (props) => (
        <Modal {...props} size="lg" aria-labelledby="contained-modal-title-vcenter" centered>
            <Modal.Header closeButton>
                <Modal.Title id="contained-modal-title-vcenter">Lien Public & QR Code</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
                <h5>Lien Public de votre Formulaire :</h5>
                <InputGroup className="mb-3">
                    <Form.Control defaultValue={publicUrl} readOnly onClick={(e) => e.target.select()}/>
                    <Button variant="outline-secondary" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copier</Button>
                </InputGroup>
                <div className="mt-4">
                    <QRCodeSVG value={publicUrl} size={256} level={"H"} includeMargin={true}/>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={props.onHide}>Fermer</Button>
            </Modal.Footer>
        </Modal>
    );

    return (
        <>
            <Button variant="secondary" className="mb-4" onClick={() => navigate('/dashboard')}>
                &larr; Retour au Dashboard
            </Button>
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1>Statistiques : {stats.title}</h1>
                </Col>
                <Col className="text-end">
                    <Button variant="info" onClick={() => setModalShow(true)}>
                        Afficher Lien & QR Code
                    </Button>
                </Col>
            </Row>

            <Row className="mb-4 text-center">
                <Col md={4}>
                    <Card className="shadow-sm">
                        <Card.Body>
                            <Card.Title>Vues</Card.Title>
                            <Card.Text className="h3 text-primary">{stats.views}</Card.Text>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="shadow-sm">
                        <Card.Body>
                            <Card.Title>Soumissions</Card.Title>
                            <Card.Text className="h3 text-success">{stats.submissionCount}</Card.Text>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="shadow-sm">
                        <Card.Body>
                            <Card.Title>Taux de Conversion</Card.Title>
                            <Card.Text className="h3 text-warning">{stats.conversionRate}%</Card.Text>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            
            <h3 className="mt-5 mb-3">Soumissions récentes (Aperçu)</h3>
            <Card className="shadow-sm mb-4 p-3">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                        data={submissionData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Soumissions" fill="#8884d8" />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            <h3 className="mt-5 mb-3">Données Détaillées des Soumissions ({stats.submissions.length})</h3>
            
            <ListGroup>
                {stats.submissions.map((submission, index) => (
                    <ListGroup.Item key={index} className="shadow-sm mb-2">
                        <p className="fw-bold text-muted">Soumis le : {new Date(submission.submittedAt).toLocaleString()}</p>
                        <ListGroup variant="flush">
                            {Object.entries(submission.data).map(([key, value], idx) => (
                                <ListGroup.Item key={idx}>
                                    <span className="fw-bold">{key} :</span> {typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : value}
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </ListGroup.Item>
                ))}
            </ListGroup>
            
            {publicUrl && (
                <QRCodeModal
                    show={modalShow}
                    onHide={() => setModalShow(false)}
                />
            )}
        </>
    );
};


// --- PARTIE 5 : FORMULAIRE PUBLIC (Soumission par l'utilisateur) ---
const PublicFormPage = ({ match, apiUrl }) => {
    const token = match.params.token;
    const [form, setForm] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Récupération du formulaire public
    useEffect(() => {
        const fetchForm = async () => {
            setLoading(true);
            setError('');
            setSuccess('');
            try {
                const response = await axios.get(`${apiUrl}/public/form/${token}`);
                setForm(response.data);
                
                // Initialise les données du formulaire
                const initialData = {};
                response.data.fields.forEach(field => {
                    initialData[field.label] = field.type === 'checkbox' ? false : '';
                });
                setFormData(initialData);

            } catch (err) {
                setForm(null);
                setError(err.response?.data?.message || 'Erreur lors du chargement du formulaire.');
            } finally {
                setLoading(false);
            }
        };
        fetchForm();
    }, [apiUrl, token]);

    const handleChange = (label, value) => {
        setFormData({ ...formData, [label]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            await axios.post(`${apiUrl}/public/form/${token}/submit`, formData);
            setSuccess('Votre soumission a été enregistrée avec succès !');
            // Réinitialise le formulaire après succès
            const initialData = {};
            form.fields.forEach(field => {
                initialData[field.label] = field.type === 'checkbox' ? false : '';
            });
            setFormData(initialData);

        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la soumission. Veuillez réessayer.');
        }
    };

    if (loading) return <div className="text-center mt-5">Chargement du formulaire...</div>;
    if (error) return <Alert variant="danger" className="mt-5">{error}</Alert>;
    if (!form) return <div className="text-center mt-5">Formulaire introuvable.</div>;

    return (
        <Card className="shadow-lg p-4 mx-auto my-5" style={{ maxWidth: '800px' }}>
            <div className="text-center mb-4">
                {form.logoPath && (
                    <img src={form.logoPath} alt="Logo de l'entreprise" style={{ maxWidth: '100px', maxHeight: '100px', marginBottom: '15px' }} />
                )}
                <Card.Title as="h2">{form.title}</Card.Title>
            </div>
            
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}

            <Form onSubmit={handleSubmit}>
                {form.fields.map((field, index) => (
                    <Form.Group className="mb-3" key={index}>
                        <Form.Label>{field.label}</Form.Label>
                        {field.type === 'textarea' ? (
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={formData[field.label] || ''}
                                onChange={(e) => handleChange(field.label, e.target.value)}
                                required
                            />
                        ) : field.type === 'checkbox' ? (
                            <Form.Check
                                type="checkbox"
                                checked={formData[field.label] || false}
                                onChange={(e) => handleChange(field.label, e.target.checked)}
                                label={field.label}
                            />
                        ) : (
                            <Form.Control
                                type={field.type}
                                value={formData[field.label] || ''}
                                onChange={(e) => handleChange(field.label, e.target.value)}
                                required
                            />
                        )}
                    </Form.Group>
                ))}
                <div className="text-center mt-4">
                    <Button variant="primary" type="submit" size="lg">
                        Soumettre
                    </Button>
                </div>
            </Form>
        </Card>
    );
};


// --- PARTIE 6 : COMPOSANT PRINCIPAL (ROUTAGE SIMPLE) ---
const App = () => {
    const [path, setPath] = useState(window.location.pathname);
    const [user, setUser] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [editingFormId, setEditingFormId] = useState(null);
    const [statsFormId, setStatsFormId] = useState(null);

    // Navigation de base
    const navigate = useCallback((newPath) => {
        window.history.pushState({}, '', newPath);
        setPath(newPath);
        // Réinitialiser les états spécifiques au formulaire/stats à chaque navigation
        if (newPath === '/dashboard') {
            setEditingFormId(null);
            setStatsFormId(null);
        }
    }, []);

    // Gestion du popstate (boutons Précédent/Suivant du navigateur)
    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Chargement de l'utilisateur (token) au démarrage
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            checkAuth(token);
        } else {
            setLoadingAuth(false);
            if (path !== '/' && !path.startsWith('/form/')) {
                navigate('/');
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Dépendance vide pour s'exécuter une seule fois au montage

    const checkAuth = async (token) => {
        try {
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            const response = await axios.get(`${API_URL}/auth/me`, config);
            setUser(response.data.user);
            localStorage.setItem('token', token);
            if (path === '/') {
                 navigate('/dashboard'); // Redirige si connecté et sur la page d'accueil
            }
        } catch (err) {
            handleLogout(false);
        } finally {
            setLoadingAuth(false);
        }
    };

    const handleAuthSuccess = (token, userData) => {
        localStorage.setItem('token', token);
        setUser(userData);
        navigate('/dashboard');
    };

    const handleLogout = (shouldNavigate = true) => {
        localStorage.removeItem('token');
        setUser(null);
        setEditingFormId(null);
        setStatsFormId(null);
        if (shouldNavigate) {
            navigate('/');
        }
    };

    // Fonctions de navigation du Dashboard
    const navigateToEditForm = (formId) => {
        setEditingFormId(formId);
        setStatsFormId(null);
        navigate(`/edit/${formId || 'new'}`);
    };
    
    const navigateToStats = (formId) => {
        setStatsFormId(formId);
        setEditingFormId(null);
        navigate(`/stats/${formId}`);
    };

    // Détermine quel composant afficher
    const renderRoute = () => {
        // Logique pour la page publique du formulaire (URL: /form/:token)
        if (path.startsWith('/form/')) {
            // 🎯 ROUTAGE PUBLIC : Regex relâchée pour accepter des tokens non-hexadécimaux
            const tokenMatch = path.match(/\/form\/([a-zA-Z0-9_-]+)$/); 

            if (tokenMatch) {
                return <PublicFormPage match={{ params: { token: tokenMatch[1] }} } apiUrl={API_URL} />;
            }
            // Si le format n'est pas bon
            return <div className="text-center mt-5"><Alert variant="danger">Erreur: Format de lien public invalide.</Alert></div>;
        }

        if (loadingAuth) {
            return <div className="text-center mt-5">Chargement de l'application...</div>;
        }

        // Accès restreint au dashboard
        if (!user) {
            return <Auth onAuthSuccess={handleAuthSuccess} apiUrl={API_URL} />;
        }

        if (path === '/dashboard' || path === '/') {
            return <Dashboard 
                        user={user} 
                        apiUrl={API_URL} 
                        token={localStorage.getItem('token')} 
                        navigateToEditForm={navigateToEditForm}
                        navigateToStats={navigateToStats}
                    />;
        }

        if (path.startsWith('/edit/') && editingFormId) {
            return <FormEditor 
                        initialForm={{_id: editingFormId}} 
                        onSaveSuccess={() => navigate('/dashboard')} 
                        apiUrl={API_URL} 
                        token={localStorage.getItem('token')}
                    />;
        }

        if (path === '/edit/new') {
             return <FormEditor 
                        initialForm={null} 
                        onSaveSuccess={() => navigate('/dashboard')} 
                        apiUrl={API_URL} 
                        token={localStorage.getItem('token')}
                    />;
        }

        if (path.startsWith('/stats/') && statsFormId) {
            return <FormStats 
                        formId={statsFormId} 
                        apiUrl={API_URL} 
                        token={localStorage.getItem('token')}
                        navigate={navigate}
                    />;
        }

        // Si aucune route ne correspond
        return <div className="text-center mt-5"><Alert variant="warning">Page 404 - Introuvable</Alert></div>;
    };

    return (
        <>
            {/* Navbar affichée uniquement sur la page d'accueil ou le dashboard, et non sur le formulaire public */}
            {path === '/' || path === '/dashboard' || path.startsWith('/edit/') || path.startsWith('/stats/') ? (
                <Navbar bg="primary" variant="dark" expand="lg" className="mb-4">
                    <Container>
                        <Navbar.Brand onClick={() => navigate(user ? '/dashboard' : '/')} style={{ cursor: 'pointer' }}>
                            📝 FormGen Pro
                        </Navbar.Brand>
                        <Navbar.Toggle aria-controls="basic-navbar-nav" />
                        <Navbar.Collapse id="basic-navbar-nav">
                            <Nav className="ms-auto">
                                {user ? (
                                    <>
                                        <Navbar.Text className="me-3">
                                            Bienvenue, <strong className="text-white">{user.companyName}</strong>
                                        </Navbar.Text>
                                        <Button variant="outline-light" onClick={() => handleLogout(true)}>Déconnexion</Button>
                                    </>
                                ) : (
                                    <Nav.Link onClick={() => navigate('/')}>Connexion/Inscription</Nav.Link>
                                )}
                            </Nav>
                        </Navbar.Collapse>
                    </Container>
                </Navbar>
            ) : null}

            {/* Le container est "fluid" sur le formulaire public, sinon il est centré */}
            <Container fluid={path.startsWith('/form/')}>
                {renderRoute()}
            </Container>
        </>
    );
};

export default App;