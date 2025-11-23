// client/src/App.js - TOUT LE FRONTEND EN UN SEUL FICHIER (FINAL V5 avec correction du lien public)

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { 
    Container, Nav, Navbar, Button, Card, Row, Col, 
    Form, Alert, ListGroup, InputGroup, Modal 
} from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react'; 

// 💡 BONNE PRATIQUE: Utiliser une variable d'environnement si possible, mais gardons la constante pour ce fichier.
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
            setError(err.response?.data?.message || 'Une erreur est survenue.');
        }
    };

    return (
        <Card className="shadow-lg p-4 mx-auto" style={{ maxWidth: '500px' }}>
            <Card.Title className="text-center mb-4">
                {isLogin ? 'Connexion Entreprise' : 'Inscription Entreprise'}
            </Card.Title>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form onSubmit={handleSubmit}>
                {!isLogin && (
                    <Form.Group className="mb-3">
                        <Form.Label>Nom de l'Entreprise</Form.Label>
                        <Form.Control 
                            type="text" 
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
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Mot de passe</Form.Label>
                    <Form.Control 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100 mt-2">
                    {isLogin ? 'Se Connecter' : 'S\'inscrire'}
                </Button>
            </Form>
            <Button variant="link" onClick={() => setIsLogin(!isLogin)} className="mt-3">
                {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </Button>
        </Card>
    );
};

// --- PARTIE 2 : CONSTRUCTEUR DE FORMULAIRE (BUILDER) ---
const FormBuilder = ({ form, setForm, onSave, onUploadLogo, isNewForm, token, apiUrl }) => {
    const [fieldLabel, setFieldLabel] = useState('');
    const [fieldType, setFieldType] = useState('text');
    const [logoFile, setLogoFile] = useState(null); 
    const [uploadError, setUploadError] = useState('');

    const addField = () => {
        if (fieldLabel.trim()) {
            setForm({
                ...form,
                fields: [...form.fields, { label: fieldLabel, type: fieldType }]
            });
            setFieldLabel('');
        }
    };

    const removeField = (index) => {
        const newFields = form.fields.filter((_, i) => i !== index);
        setForm({ ...form, fields: newFields });
    };

    // LOGIQUE BASE64 : Lire le fichier et le stocker en Data URL
    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoFile(reader.result); 
                setUploadError('');
            };
            reader.readAsDataURL(file);
        }
    };

    // LOGIQUE BASE64 : Envoyer la Data URL via JSON
    const handleLogoUpload = async () => {
        if (!logoFile) { 
            setUploadError("Veuillez d'abord sélectionner un fichier.");
            return;
        }
        if (!form._id) { 
             setUploadError("Erreur: Le formulaire doit être sauvegardé avant d'uploader le logo.");
             return;
        }

        try {
            const response = await axios.post(`${apiUrl}/forms/${form._id}/logo`, 
                { logoData: logoFile }, 
                {
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            setForm({ ...form, logoPath: response.data.logoPath });
            setLogoFile(null); 
            setUploadError('');
            alert("Logo stocké dans MongoDB avec succès !");
            onUploadLogo();
        } catch (error) {
            setUploadError(error.response?.data?.message || "Erreur lors de l'upload.");
        }
    };

    return (
        <Card className="mb-4">
            <Card.Header className="bg-success text-white">
                <Row className="align-items-center">
                    <Col>
                        <h4 className="mb-0">Constructeur de Formulaire</h4>
                    </Col>
                    <Col xs="auto">
                        <Button variant="light" onClick={onSave} disabled={!form.title.trim()}>
                            <i className="bi bi-save me-2"></i> Sauvegarder
                        </Button>
                    </Col>
                </Row>
            </Card.Header>
            <Card.Body>
                <Form.Group className="mb-3">
                    <Form.Label>Titre du Formulaire</Form.Label>
                    <Form.Control 
                        type="text" 
                        placeholder="Ex: Enquête de Satisfaction" 
                        value={form.title} 
                        onChange={(e) => setForm({ ...form, title: e.target.value })} 
                    />
                </Form.Group>

                <hr/>

                <Row className="mb-4 align-items-end">
                    <Col md={5}>
                        <Form.Group>
                            <Form.Label>Type de Champ</Form.Label>
                            <Form.Select value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                                <option value="text">Texte Court</option>
                                <option value="textarea">Paragraphe</option>
                                <option value="email">Email</option>
                                <option value="number">Nombre</option>
                                <option value="checkbox">Case à cocher</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={5}>
                        <Form.Group>
                            <Form.Label>Étiquette du Champ</Form.Label> 
                            <Form.Control 
                                type="text" 
                                placeholder="Ex: Votre Nom Complet" 
                                value={fieldLabel} 
                                onChange={(e) => setFieldLabel(e.target.value)} 
                            />
                        </Form.Group>
                    </Col>
                    <Col md={2}>
                        <Button onClick={addField} variant="info" className="w-100">
                            + Ajouter
                        </Button>
                    </Col>
                </Row>

                <h5 className="mt-4">Champs Actuels ({form.fields.length})</h5>
                <ListGroup className="mb-4">
                    {form.fields.map((field, index) => (
                        <ListGroup.Item key={index} className="d-flex justify-content-between align-items-center">
                            <span>**{field.label}** (`{field.type}`)</span>
                            <Button variant="outline-danger" size="sm" onClick={() => removeField(index)}>
                                X
                            </Button>
                        </ListGroup.Item>
                    ))}
                    {form.fields.length === 0 && <ListGroup.Item className="text-center text-muted">Ajouter votre premier champ ci-dessus.</ListGroup.Item>}
                </ListGroup>

                {/* Upload de Logo */}
                <Card className="mt-4 p-3 bg-light">
                    <h6>Logo de l'Entreprise pour le Formulaire</h6>
                    <InputGroup>
                        <Form.Control type="file" onChange={handleLogoChange} accept="image/*" />
                        <Button 
                            variant="primary" 
                            onClick={handleLogoUpload} 
                            disabled={!logoFile || !form._id} 
                        >
                            Uploader le Logo
                        </Button>
                    </InputGroup>
                    {uploadError && <Alert variant="warning" className="mt-2">{uploadError}</Alert>}
                    {/* AFFICHAGE : Utilisation directe de la Data URL Base64 */}
                    {form.logoPath && (
                        <p className="mt-2 text-success">
                            Logo actuel: <img src={form.logoPath} alt="Logo Aperçu" style={{height: '30px', marginLeft: '10px'}}/>
                        </p>
                    )}
                </Card>
            </Card.Body>
        </Card>
    );
};

// --- PARTIE 3 : DASHBOARD ET GESTION DES FORMULAIRES ---
const Dashboard = ({ user, token, apiUrl }) => {
    const [forms, setForms] = useState([]);
    const [currentView, setCurrentView] = useState('list'); 
    const [selectedForm, setSelectedForm] = useState(null);
    // 💡 AJOUT DE 'publicUrl' dans l'état initial
    const [currentFormDetails, setCurrentFormDetails] = useState({ title: '', fields: [], logoPath: '', publicUrl: '' });
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [qrCodeDataURL, setQrCodeDataURL] = useState('');
    const [isNewForm, setIsNewForm] = useState(true);

    const fetchForms = useCallback(async () => {
        try {
            const response = await axios.get(`${apiUrl}/forms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setForms(response.data);
            setError('');
        } catch (err) {
            setError('Erreur lors de la récupération des formulaires.');
        }
    }, [apiUrl, token]);

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    const handleNewForm = () => {
        setIsNewForm(true);
        setSelectedForm(null);
        // 💡 AJOUT DE 'publicUrl' à la réinitialisation
        setCurrentFormDetails({ title: '', fields: [], logoPath: '', publicUrl: '' }); 
        setQrCodeDataURL('');
        setCurrentView('builder');
    };

    const handleEditForm = (form) => {
        setIsNewForm(false);
        setSelectedForm(form);
        // La reconstruction de l'URL publique n'est pas nécessaire ici, elle sera faite après la première sauvegarde
        setCurrentFormDetails({ ...form, publicUrl: '' }); 
        setQrCodeDataURL('');
        setCurrentView('builder');
    };

    const handleSaveForm = async () => {
        setSuccessMessage('');
        setError('');
        try {
            const dataToSave = { 
                title: currentFormDetails.title, 
                fields: currentFormDetails.fields,
                // Utiliser _id de l'état actuel pour la mise à jour si elle existe
                ...(currentFormDetails._id && { _id: currentFormDetails._id }) 
            };
            
            const response = await axios.post(`${apiUrl}/forms`, dataToSave, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const savedForm = response.data.form;
            // 💡 CORRECTION CRITIQUE: Récupération de l'URL publique générée par le backend
            const generatedPublicUrl = response.data.publicUrl; 
            
            setSelectedForm(savedForm);
            setIsNewForm(false);
            setQrCodeDataURL(response.data.qrCodeDataURL);
            setSuccessMessage('Formulaire sauvegardé et lien public généré !');
            
            // Mise à jour currentFormDetails avec l'ID, le token ET l'URL publique
            setCurrentFormDetails(prevDetails => ({
                ...prevDetails,
                _id: savedForm._id, 
                urlToken: savedForm.urlToken,
                publicUrl: generatedPublicUrl, // 💡 CORRECTION : Stockage de l'URL de production
            }));


            fetchForms();

        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la sauvegarde du formulaire.');
        }
    };

    const handleViewStats = async (formId) => {
        setError('');
        try {
            const response = await axios.get(`${apiUrl}/forms/${formId}/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStats(response.data);
            setCurrentView('stats');
        } catch (err) {
            setError('Erreur lors de la récupération des statistiques.');
        }
    };

    const renderContent = () => {
        if (successMessage) {
            setTimeout(() => setSuccessMessage(''), 5000);
        }
        
        if (currentView === 'builder') {
            // 💡 CORRECTION : Utilisation de l'URL publique stockée, sinon vide.
            const publicUrl = currentFormDetails.publicUrl || '';
            
            return (
                <>
                    {successMessage && <Alert variant="success">{successMessage}</Alert>}
                    {/* Afficher le QR code et le lien seulement si l'URL est disponible (après sauvegarde) */}
                    {qrCodeDataURL && publicUrl && (
                        <Card className="mb-4 p-3 text-center bg-light">
                            <h5>QR Code et Lien Public</h5>
                            {/* Le QR codeDataURL contient la bonne URL générée par le backend */}
                            <QRCodeSVG value={publicUrl} size={128} level="H" includeMargin={true} />
                            
                            <p className="mt-2">
                                Lien: <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                                    {publicUrl}
                                </a>
                            </p>
                            <Button 
                                variant="outline-primary" 
                                className="mt-2" 
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = qrCodeDataURL;
                                    link.download = `formulaire_${currentFormDetails.urlToken}_qr.png`;
                                    link.click();
                                }}
                            >
                                Télécharger le QR Code
                            </Button>
                        </Card>
                    )}
                    <FormBuilder 
                        form={currentFormDetails} 
                        setForm={setCurrentFormDetails} 
                        onSave={handleSaveForm}
                        onUploadLogo={fetchForms}
                        isNewForm={isNewForm}
                        token={token}
                        apiUrl={apiUrl}
                    />
                </>
            );
        }

        if (currentView === 'stats' && stats) {
            return (
                <Card className="mb-4">
                    <Card.Header className="bg-dark text-white d-flex justify-content-between align-items-center">
                        <h5>Statistiques pour "{stats.title}"</h5>
                        <Button variant="light" onClick={() => setCurrentView('list')}>Retour à la liste</Button>
                    </Card.Header>
                    <Card.Body>
                        <Row className="text-center mb-4">
                            <Col>
                                <h4>{stats.views}</h4>
                                <p>Vues Totales</p>
                            </Col>
                            <Col>
                                <h4>{stats.submissionCount}</h4>
                                <p>Soumissions Totales</p>
                            </Col>
                            <Col>
                                <h4>{stats.conversionRate}%</h4>
                                <p>Taux de Conversion</p>
                            </Col>
                        </Row>
                        
                        <h5 className="mt-4">Détails des Soumissions ({stats.submissionCount})</h5>
                        <ListGroup>
                            {stats.submissions.map((sub, index) => (
                                <ListGroup.Item key={index}>
                                    <h6>Soumission #{index + 1} - {new Date(sub.submittedAt).toLocaleString()}</h6>
                                    <pre style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>
                                        {JSON.stringify(sub.data, null, 2)}
                                    </pre>
                                </ListGroup.Item>
                            ))}
                            {stats.submissions.length === 0 && <Alert variant="info" className="mt-3">Aucune soumission pour ce formulaire.</Alert>}
                        </ListGroup>
                    </Card.Body>
                </Card>
            );
        }

        // Vue par défaut : Liste des formulaires
        return (
            <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                    <h5>Vos Formulaires</h5>
                    <Button variant="primary" onClick={handleNewForm}>
                        + Créer un Nouveau Formulaire
                    </Button>
                </Card.Header>
                <Card.Body>
                    <ListGroup>
                        {forms.map((form) => (
                            <ListGroup.Item key={form._id} className="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 className="mb-1">{form.title}</h6>
                                    <small className="text-muted">Créé le: {new Date(form.createdAt).toLocaleDateString()}</small>
                                </div>
                                <div>
                                    <Button variant="outline-info" size="sm" className="me-2" onClick={() => handleEditForm(form)}>
                                        Éditer
                                    </Button>
                                    <Button variant="outline-success" size="sm" onClick={() => handleViewStats(form._id)}>
                                        Stats ({form.submissions})
                                    </Button>
                                </div>
                            </ListGroup.Item>
                        ))}
                        {forms.length === 0 && <Alert variant="info" className="text-center mt-3">Vous n'avez pas encore créé de formulaires.</Alert>}
                    </ListGroup>
                </Card.Body>
            </Card>
        );
    };

    return (
        <div className="dashboard">
            {error && <Alert variant="danger">{error}</Alert>}
            {renderContent()}
        </div>
    );
};

// --- PARTIE 4 : PAGE PUBLIQUE DE SOUMISSION DU FORMULAIRE ---
const PublicFormPage = ({ match, apiUrl }) => {
    const [formDetails, setFormDetails] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitStatus, setSubmitStatus] = useState({ message: '', variant: '' });
    const urlToken = match.params.token;

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const response = await axios.get(`${apiUrl}/public/form/${urlToken}`);
                setFormDetails(response.data);
                
                const initialData = response.data.fields.reduce((acc, field) => {
                    // Simplification de la clé du formulaire (bonne pratique pour le JSON)
                    const key = field.label.toLowerCase().replace(/\s/g, '_'); 
                    acc[key] = field.type === 'checkbox' ? false : '';
                    return acc;
                }, {});
                setFormData(initialData);
            } catch (error) {
                setSubmitStatus({ message: 'Formulaire non trouvé ou lien invalide.', variant: 'danger' });
            } finally {
                setLoading(false);
            }
        };
        fetchForm();
    }, [urlToken, apiUrl]);

    const handleChange = (key, value) => {
        setFormData({ ...formData, [key]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitStatus({ message: 'Envoi en cours...', variant: 'info' });
        try {
            await axios.post(`${apiUrl}/public/form/${urlToken}/submit`, formData);
            setSubmitStatus({ message: 'Merci ! Votre soumission a été enregistrée avec succès.', variant: 'success' });
            setFormData({}); 
        } catch (error) {
            setSubmitStatus({ message: 'Erreur lors de la soumission. Veuillez réessayer.', variant: 'danger' });
        }
    };

    if (loading) return <Container className="text-center mt-5">Chargement du formulaire...</Container>;

    if (submitStatus.variant === 'danger' && !formDetails) {
        return <Container className="mt-5"><Alert variant="danger">{submitStatus.message}</Alert></Container>;
    }

    return (
        <Container className="my-5" style={{ maxWidth: '800px' }}>
            <Card className="shadow-lg">
                <Card.Header className="text-center bg-primary text-white">
                    {formDetails.logoPath && (
                        <img 
                            src={formDetails.logoPath} 
                            alt="Logo Entreprise" 
                            style={{ maxHeight: '60px', marginBottom: '10px' }}
                            className="img-fluid"
                        />
                    )}
                    <h2 className="mb-0">{formDetails.title}</h2>
                </Card.Header>
                <Card.Body>
                    {submitStatus.message && (
                        <Alert variant={submitStatus.variant} className="mb-4">
                            {submitStatus.message}
                        </Alert>
                    )}
                    <Form onSubmit={handleSubmit}>
                        {formDetails.fields.map((field, index) => {
                            const key = field.label.toLowerCase().replace(/\s/g, '_');
                            return (
                                <Form.Group className="mb-3" key={index}>
                                    <Form.Label>{field.label}{field.type !== 'checkbox' && '*'}</Form.Label>
                                    {field.type === 'text' && (
                                        <Form.Control 
                                            type="text" 
                                            onChange={(e) => handleChange(key, e.target.value)} 
                                            value={formData[key] || ''} 
                                            required 
                                        />
                                    )}
                                    {field.type === 'textarea' && (
                                        <Form.Control 
                                            as="textarea" 
                                            rows={3} 
                                            onChange={(e) => handleChange(key, e.target.value)} 
                                            value={formData[key] || ''} 
                                            required 
                                        />
                                    )}
                                    {field.type === 'email' && (
                                        <Form.Control 
                                            type="email" 
                                            onChange={(e) => handleChange(key, e.target.value)} 
                                            value={formData[key] || ''} 
                                            required 
                                        />
                                    )}
                                    {field.type === 'number' && (
                                        <Form.Control 
                                            type="number" 
                                            onChange={(e) => handleChange(key, e.target.value)} 
                                            value={formData[key] || ''} 
                                            required 
                                        />
                                    )}
                                    {field.type === 'checkbox' && (
                                        <Form.Check
                                            type="checkbox"
                                            label={field.label}
                                            onChange={(e) => handleChange(key, e.target.checked)}
                                            checked={formData[key] || false}
                                        />
                                    )}
                                </Form.Group>
                            );
                        })}
                        <Button variant="success" type="submit" className="w-100 mt-4">
                            Soumettre le Formulaire
                        </Button>
                    </Form>
                </Card.Body>
                <Card.Footer className="text-center text-muted">Propulsé par FormGen Pro</Card.Footer>
            </Card>
        </Container>
    );
};

// --- PARTIE 5 : COMPOSANT PRINCIPAL (ROUTAGE SIMPLE) ---
const App = () => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [loading, setLoading] = useState(true);
    const [path, setPath] = useState(window.location.pathname);
    
    // Simuler un routage simple pour React, sans react-router-dom
    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const navigate = (newPath) => {
        window.history.pushState({}, '', newPath);
        setPath(newPath);
    };

    // Vérification de l'utilisateur au démarrage
    useEffect(() => {
        const verifyUser = async () => {
            if (token) {
                try {
                    const response = await axios.get(`${API_URL}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setUser(response.data.user);
                } catch (error) {
                    console.error("Token non valide ou expiré.");
                    handleLogout(false);
                }
            }
            setLoading(false);
        };
        verifyUser();
    }, [token]);

    const handleAuth = (tokenData, userData) => {
        localStorage.setItem('token', tokenData);
        setToken(tokenData);
        setUser(userData);
        navigate('/dashboard');
    };

    const handleLogout = (reload = true) => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        navigate('/');
        if (reload) window.location.reload();
    };

    if (loading) {
        return <div className="text-center mt-5">Chargement de l'application...</div>;
    }

    // Détermine quel composant afficher
    const renderRoute = () => {
        // Logique pour la page publique du formulaire (URL: /form/:token)
        if (path.startsWith('/form/')) {
            const tokenMatch = path.match(/\/form\/([a-fA-F0-9]{24})$/); 
            if (tokenMatch) {
                return <PublicFormPage match={{ params: { token: tokenMatch[1] }} } apiUrl={API_URL} />;
            }
        }

        // Accès restreint au dashboard
        if (user && path === '/dashboard') {
            return <Dashboard user={user} token={token} apiUrl={API_URL} />;
        }
        
        // Page d'accueil/Auth si non connecté
        if (!user) {
            return <Auth onAuthSuccess={handleAuth} apiUrl={API_URL} />;
        }

        // Redirection par défaut après connexion
        if (user && path === '/') {
            navigate('/dashboard');
        }

        // Si aucune route ne correspond
        return <div className="text-center mt-5">Page 404 - Introuvable</div>;
    };

    // Le layout de l'application (Navbar)
    return (
        <>
            {/* La Navbar n'est affichée que pour les vues d'administration (Auth ou Dashboard) */}
            {path === '/' || path === '/dashboard' ? (
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
                                            Bienvenue, **{user.companyName}**
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

            <Container fluid={path.startsWith('/form/')}>
                {renderRoute()}
            </Container>
        </>
    );
};

export default App;