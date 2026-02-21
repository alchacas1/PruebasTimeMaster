// src/edit/DataEditor.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useToast from '../hooks/useToast';
import { Save, Download, FileText, Users, Clock, DollarSign, Eye, EyeOff, Settings, Check, X, Lock, Edit, Smartphone, Clipboard, Trash2, Plus, UserPlus, Building, Info, List } from 'lucide-react';
import { EmpresasService } from '../services/empresas';
import { SorteosService } from '../services/sorteos';
import { UsersService } from '../services/users';
import { useAuth } from '../hooks/useAuth';
import { useActorOwnership } from '../hooks/useActorOwnership';
import { CcssConfigService } from '../services/ccss-config';
import { FondoMovementTypesService } from '../services/fondo-movement-types';
import { Sorteo, User, CcssConfig, UserPermissions, companies, FondoMovementTypeConfig } from '../types/firestore';
import { getDefaultPermissions, getNoPermissions, hasPermission } from '../utils/permissions';
import ScheduleReportTab from '../components/business/ScheduleReportTab';
import ConfirmModal from '../components/ui/ConfirmModal';
import ExportModal from '../components/export/ExportModal';

type DataFile = 'sorteos' | 'users' | 'schedules' | 'ccss' | 'empresas' | 'fondoTypes';

export default function DataEditor() {
    const [activeFile, setActiveFile] = useState<DataFile>('empresas');
    const { user: currentUser } = useAuth();
    const [sorteosData, setSorteosData] = useState<Sorteo[]>([]);
    const [usersData, setUsersData] = useState<User[]>([]);
    const [ccssConfigsData, setCcssConfigsData] = useState<CcssConfig[]>([]);
    const [empresasData, setEmpresasData] = useState<any[]>([]);
    const [fondoTypesData, setFondoTypesData] = useState<FondoMovementTypeConfig[]>([]);
    const [originalEmpresasData, setOriginalEmpresasData] = useState<any[]>([]);
    const [originalSorteosData, setOriginalSorteosData] = useState<Sorteo[]>([]);
    const [originalUsersData, setOriginalUsersData] = useState<User[]>([]);
    const [originalCcssConfigsData, setOriginalCcssConfigsData] = useState<CcssConfig[]>([]);
    const [originalFondoTypesData, setOriginalFondoTypesData] = useState<FondoMovementTypeConfig[]>([]);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const { ownerIds: actorOwnerIds, primaryOwnerId } = useActorOwnership(currentUser);
    const actorOwnerIdSet = useMemo(() => new Set(actorOwnerIds.map(id => String(id))), [actorOwnerIds]);
    const resolveOwnerIdForActor = useCallback(
        (provided?: string) => {
            if (provided) return provided;
            return primaryOwnerId;
        },
        [primaryOwnerId]
    );
    const [passwordVisibility, setPasswordVisibility] = useState<{ [key: string]: boolean }>({});
    const [passwordStore, setPasswordStore] = useState<Record<string, string>>({});
    const [passwordBaseline, setPasswordBaseline] = useState<Record<string, string>>({});
    const [savingUserKey, setSavingUserKey] = useState<string | null>(null);
    const [showPermissions, setShowPermissions] = useState<{ [key: string]: boolean }>({});
    const [permissionsEditable, setPermissionsEditable] = useState<{ [key: string]: boolean }>({});
    const [changePasswordMode, setChangePasswordMode] = useState<{ [key: string]: boolean }>({});

    // Estado para trackear cambios individuales de ubicaciones (removed)

    // Estado para modal de confirmación
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm: (() => void) | null;
        loading: boolean;
        singleButton?: boolean;
        singleButtonText?: string;
    }>({
        open: false,
        title: '',
        message: '',
        onConfirm: null,
        loading: false,
        singleButton: false,
        singleButtonText: undefined
    });    // Detectar cambios

    // Helpers para modal de confirmación
    const openConfirmModal = (title: string, message: string, onConfirm: () => void, opts?: { singleButton?: boolean; singleButtonText?: string }) => {
        setConfirmModal({ open: true, title, message, onConfirm, loading: false, singleButton: opts?.singleButton, singleButtonText: opts?.singleButtonText });
    };

    const closeConfirmModal = () => {
        setConfirmModal({ open: false, title: '', message: '', onConfirm: null, loading: false, singleButton: false, singleButtonText: undefined });
    };

    const handleConfirm = async () => {
        if (confirmModal.onConfirm) {
            try {
                setConfirmModal(prev => ({ ...prev, loading: true }));
                await Promise.resolve(confirmModal.onConfirm());
            } catch (error: unknown) {
                console.error('Error in confirm action:', error);
                const msg = error instanceof Error ? error.message : String(error || 'Error');
                showToast(msg.includes('Forbidden') ? 'No tienes permisos para realizar esta acción' : 'Error al ejecutar la acción', 'error');
            } finally {
                closeConfirmModal();
            }
        }
    };
    useEffect(() => {
        const sorteosChanged = JSON.stringify(sorteosData) !== JSON.stringify(originalSorteosData);
        const usersChanged = JSON.stringify(usersData) !== JSON.stringify(originalUsersData);
        const ccssChanged = JSON.stringify(ccssConfigsData) !== JSON.stringify(originalCcssConfigsData);
        const empresasChanged = JSON.stringify(empresasData) !== JSON.stringify(originalEmpresasData);
        const fondoTypesChanged = JSON.stringify(fondoTypesData) !== JSON.stringify(originalFondoTypesData);
        setHasChanges(sorteosChanged || usersChanged || ccssChanged || empresasChanged || fondoTypesChanged);
    }, [sorteosData, usersData, ccssConfigsData, empresasData, fondoTypesData, originalSorteosData, originalUsersData, originalCcssConfigsData, originalEmpresasData, originalFondoTypesData]);

    const loadData = useCallback(async () => {
        try {
            // Cargar sorteos desde Firebase
            const sorteos = await SorteosService.getAllSorteos();
            setSorteosData(sorteos);
            setOriginalSorteosData(JSON.parse(JSON.stringify(sorteos)));

            // Cargar empresas desde Firebase
            // hoist a variable so later user-filtering can re-use the fetched empresas
            let empresasToShow: any[] = [];
            try {
                const empresas = await EmpresasService.getAllEmpresas();

                // Si el actor autenticado tiene permiso de mantenimiento, solo mostrar
                // las empresas cuyo ownerId coincide con los ownerIds permitidos del actor.
                empresasToShow = empresas;
                try {
                    if (currentUser && hasPermission(currentUser.permissions, 'mantenimiento')) {
                        if (actorOwnerIdSet.size > 0) {
                            empresasToShow = (empresas || []).filter(
                                (e: any) => e && e.ownerId && actorOwnerIdSet.has(String(e.ownerId))
                            );
                        } else {
                            // Fallback: usar currentUser.id u ownerId si no se pudo resolver un ownerId válido
                            empresasToShow = (empresas || []).filter(
                                (e: any) =>
                                    e && (
                                        (currentUser.id && String(e.ownerId) === String(currentUser.id)) ||
                                        (currentUser.ownerId && String(e.ownerId) === String(currentUser.ownerId))
                                    )
                            );
                        }
                    }
                } catch (err) {
                    // Si ocurre algún error durante el filtrado, dejar las empresas tal cual
                    console.warn('Error filtrando empresas por ownerId:', err);
                    empresasToShow = empresas;
                }

                // Additionally, if the current actor is an admin, exclude empresas
                // that belong to a superadmin (i.e., empresas whose ownerId user.role === 'superadmin')
                try {
                    if (currentUser?.role === 'admin') {
                        const ownerIds = Array.from(new Set((empresasToShow || []).map((e: any) => e.ownerId).filter(Boolean)));
                        const owners = await Promise.all(ownerIds.map(id => UsersService.getUserById(id)));
                        const ownerRoleById = new Map<string, string | undefined>();
                        ownerIds.forEach((id, idx) => ownerRoleById.set(id, owners[idx]?.role));

                        // Debug info to help diagnose missing empresas
                        console.debug('[DataEditor] currentUser:', currentUser?.id, currentUser?.ownerId, 'resolved actorOwnerId:', primaryOwnerId);
                        console.debug('[DataEditor] empresas fetched:', (empresas || []).length, 'ownerIds:', ownerIds);
                        console.debug('[DataEditor] owner roles:', Array.from(ownerRoleById.entries()));

                        empresasToShow = (empresasToShow || []).filter((e: any) => {
                            const ownerRole = ownerRoleById.get(e.ownerId);
                            // if owner is superadmin, hide from admin actors
                            if (ownerRole === 'superadmin') return false;
                            return true;
                        });

                        console.debug('[DataEditor] empresas after filtering:', empresasToShow.map((x: any) => ({ id: x.id, ownerId: x.ownerId, name: x.name })));
                    }
                } catch (err) {
                    console.warn('Error resolving empresa owners while filtering superadmin-owned empresas:', err);
                }

                setEmpresasData(empresasToShow);
                setOriginalEmpresasData(JSON.parse(JSON.stringify(empresasToShow)));
            } catch (err) {
                console.warn('No se pudo cargar empresas:', err);
                setEmpresasData([]);
                setOriginalEmpresasData([]);
            }

            // Cargar usuarios desde Firebase (solo si hay un usuario actual que actúe)
            if (currentUser) {
                const users = await UsersService.getAllUsersAs(currentUser);

                // Asegurar que todos los usuarios tengan todos los permisos disponibles
                try {
                    await UsersService.ensureAllPermissions();
                } catch (error) {
                    console.warn('Error ensuring all permissions:', error);
                }

                // Filtrar usuarios para que actores no-superadmin solo vean usuarios
                // que compartan el mismo ownerId/resolved owner del actor.
                let usersToShow = users;
                try {
                    if (currentUser.role !== 'superadmin') {
                        usersToShow = (users || []).filter(u => {
                            if (!u) return false;
                            if (u.id && currentUser.id && String(u.id) === String(currentUser.id)) return true;
                            if (!u.ownerId) return false;
                            if (actorOwnerIdSet.size > 0) {
                                return actorOwnerIdSet.has(String(u.ownerId));
                            }
                            return (
                                (currentUser.id && String(u.ownerId) === String(currentUser.id)) ||
                                (currentUser.ownerId && String(u.ownerId) === String(currentUser.ownerId))
                            );
                        });
                    }
                } catch (err) {
                    console.warn('Error filtering users by ownerId:', err);
                    usersToShow = users;
                }

                const passwordMap: Record<string, string> = {};
                const baselineMap: Record<string, string> = {};
                const sanitizedUsers = usersToShow.map((user, index) => {
                    const sanitized = { ...user } as User;
                    const key = user.id ?? (user as unknown as { __localId?: string }).__localId ?? `tmp-${index}`;
                    const storedPassword = typeof user.password === 'string' ? user.password : '';
                    passwordMap[key] = storedPassword;
                    baselineMap[key] = storedPassword;
                    sanitized.password = '';
                    return sanitized;
                });

                setUsersData(sanitizedUsers);
                setOriginalUsersData(JSON.parse(JSON.stringify(sanitizedUsers)));
                setPasswordStore(passwordMap);
                setPasswordBaseline(baselineMap);

                // Re-apply empresa filtering so admins see empresas owned by users they can see.
                try {
                    if (currentUser && currentUser.role !== 'superadmin') {
                        const visibleOwnerIds = (usersToShow || []).map(u => u.id).filter(Boolean).map(String);
                        if (visibleOwnerIds.length > 0) {
                            // Use the empresas we just fetched/filtered earlier in this function
                            const filteredEmpresas = (empresasToShow || []).filter(e => e && e.ownerId && visibleOwnerIds.includes(String(e.ownerId)));
                            // Only set if we have results; otherwise keep current empresasData (avoid hiding unintentionally)
                            if (filteredEmpresas.length > 0) {
                                setEmpresasData(filteredEmpresas);
                                setOriginalEmpresasData(JSON.parse(JSON.stringify(filteredEmpresas)));
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Error re-filtering empresas based on visible users:', err);
                }
            } else {
                // Si no hay currentUser (por ejemplo durante SSR/hydration temprana), inicializar vacíos
                setUsersData([]);
                setOriginalUsersData([]);
            }

            // Cargar configuración CCSS desde Firebase
            if (currentUser) {
                const ownerId = resolveOwnerIdForActor();
                const ccssConfigs = await CcssConfigService.getAllCcssConfigsByOwner(ownerId);
                setCcssConfigsData(ccssConfigs);
                setOriginalCcssConfigsData(JSON.parse(JSON.stringify(ccssConfigs)));
            } else {
                setCcssConfigsData([]);
                setOriginalCcssConfigsData([]);
            }

            // Cargar tipos de movimientos de fondo desde Firebase (para superadmins y admins)
            if (currentUser?.role !== 'user') {
                try {
                    const fondoTypes = await FondoMovementTypesService.getTypesFromCacheOrDB();
                    setFondoTypesData(fondoTypes);
                    setOriginalFondoTypesData(JSON.parse(JSON.stringify(fondoTypes)));
                } catch (error) {
                    console.error('Error loading fondo movement types:', error);
                    setFondoTypesData([]);
                    setOriginalFondoTypesData([]);
                }
            } else {
                setFondoTypesData([]);
                setOriginalFondoTypesData([]);
            }

        } catch (error) {
            showToast('Error al cargar los datos de Firebase', 'error');
            console.error('Error loading data from Firebase:', error);
        }
    }, [actorOwnerIdSet, currentUser, primaryOwnerId, resolveOwnerIdForActor, showToast]);

    // Cargar datos al montar el componente o cuando cambie el usuario autenticado
    useEffect(() => {
        // Solo ejecutar la carga (loadData) cuando React haya inicializado el componente.
        // loadData internamente chequea `currentUser` antes de pedir usuarios.
        loadData();
        
        // Listener para actualizaciones en tiempo real de tipos de fondo
        const handleFondoTypesUpdate = async () => {
            if (currentUser?.role !== 'user') {
                try {
                    console.log('[DataEditor] Fondo types updated, reloading...');
                    const fondoTypes = await FondoMovementTypesService.getTypesFromCacheOrDB();
                    setFondoTypesData(fondoTypes);
                    // No actualizar originalFondoTypesData para mantener el tracking de cambios
                } catch (error) {
                    console.error('Error reloading fondo types:', error);
                }
            }
        };
        
        window.addEventListener('fondoMovementTypesUpdated', handleFondoTypesUpdate);
        
        return () => {
            window.removeEventListener('fondoMovementTypesUpdated', handleFondoTypesUpdate);
        };
    }, [loadData, currentUser]);

    // Función para verificar si una ubicación específica ha cambiado (removed - locations tab deleted)

    // Función para verificar si un usuario específico ha cambiado
    // Helper: obtener key única para un usuario (id o __localId)
    const getUserKey = (user: User, index: number) => {
        return user.id ?? (user as unknown as { __localId?: string }).__localId ?? `tmp-${index}`;
    };

    const hasUserChanged = (index: number): boolean => {
        const currentUser = usersData[index];
        if (!currentUser) return false;

        // const key = getUserKey(currentUser, index);

        // Buscar original por id si existe
        let originalUser: User | null = null;
        if (currentUser.id) {
            originalUser = originalUsersData.find(u => u.id === currentUser.id) || null;
        } else {
            // intentar buscar por __localId si fue asignado previamente
            originalUser = originalUsersData.find(u => (u as unknown as { __localId?: string }).__localId === (currentUser as unknown as { __localId?: string }).__localId) || null;
        }

        if (!originalUser) return true;

        const sanitize = (u: User | null | undefined) => {
            if (!u) return u;
            const copy = { ...u } as Partial<User>;
            delete (copy as Partial<User>).createdAt;
            delete (copy as Partial<User>).updatedAt;
            return copy;
        };

        return JSON.stringify(sanitize(currentUser)) !== JSON.stringify(sanitize(originalUser));
    };

    const saveData = async () => {
        setIsSaving(true);
        try {
            // Guardar sorteos
            const existingSorteos = await SorteosService.getAllSorteos();
            for (const s of existingSorteos) { if (s.id) await SorteosService.deleteSorteo(s.id); }
            for (const s of sorteosData) { await SorteosService.addSorteo({ name: s.name }); }

            // Guardar usuarios
            const existingUsers = await UsersService.getAllUsers();
            for (const u of existingUsers) { if (u.id) { try { await UsersService.deleteUserAs(currentUser, u.id); } catch { } } }
            for (let index = 0; index < usersData.length; index++) {
                const u = usersData[index];
                const key = getUserKey(u, index);
                const storedPassword = passwordStore[key] ?? u.password;
                const perms = { ...(u.permissions || {}) } as Record<string, unknown>;
                await UsersService.createUserAs(currentUser, {
                    name: u.name,
                    ownercompanie: u.ownercompanie,
                    password: storedPassword,
                    role: u.role,
                    isActive: u.isActive,
                    permissions: perms as any,
                    maxCompanies: u.maxCompanies,
                    email: u.email,
                    fullName: u.fullName,
                    eliminate: u.eliminate ?? false,
                    ownerId: u.ownerId
                });
            }

            // Guardar configuraciones CCSS
            for (const ccssConfig of ccssConfigsData) {
                await CcssConfigService.updateCcssConfig(ccssConfig);
            }

            // Guardar empresas
            try {
                const existingEmpresas = await EmpresasService.getAllEmpresas();
                for (const e of existingEmpresas) { if (e.id) await EmpresasService.deleteEmpresa(e.id); }
                for (const empresa of empresasData) {
                    const ownerIdToUse = resolveOwnerIdForActor(empresa.ownerId);
                    const idToUse = empresa.name || undefined;
                    await EmpresasService.addEmpresa({ id: idToUse, ownerId: ownerIdToUse, name: empresa.name || '', ubicacion: empresa.ubicacion || '', empleados: empresa.empleados || [] });
                }
            } catch (err) {
                console.warn('Error al guardar empresas:', err);
            }

            // Guardar tipos de movimientos de fondo (para superadmins y admins)
            if (currentUser?.role !== 'user') {
                try {
                    const existingFondoTypes = await FondoMovementTypesService.getAllMovementTypes();
                    for (const ft of existingFondoTypes) { if (ft.id) await FondoMovementTypesService.deleteMovementType(ft.id); }
                    for (const fondoType of fondoTypesData) {
                        await FondoMovementTypesService.addMovementType({
                            category: fondoType.category,
                            name: fondoType.name,
                            order: fondoType.order
                        });
                    }
                } catch (err) {
                    console.warn('Error al guardar tipos de movimientos de fondo:', err);
                }
            }

            // Local storage and update originals
            localStorage.setItem('editedSorteos', JSON.stringify(sorteosData));
            localStorage.setItem('editedUsers', JSON.stringify(usersData));

            await loadData();

            setHasChanges(false);
            showToast('¡Datos actualizados exitosamente en Firebase!', 'success');
        } catch (error) {
            console.error('Error saving data to Firebase:', error);
            showToast('Error al guardar los datos en Firebase', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Estado y handlers para modal de exportación (por ahora muestra "Próximamente")
    const [showExportModal, setShowExportModal] = useState(false);
    const openExportModal = () => setShowExportModal(true);
    const closeExportModal = () => setShowExportModal(false);

    // Location helpers removed (locations tab deleted)

    // Funciones para manejar sorteos
    const addSorteo = () => {
        const newSorteo: Sorteo = {
            name: ''
        };
        setSorteosData([...sorteosData, newSorteo]);
    };

    const updateSorteo = (index: number, field: keyof Sorteo, value: string) => {
        const updated = [...sorteosData];
        updated[index] = { ...updated[index], [field]: value };
        setSorteosData(updated);
    };

    const removeSorteo = (index: number) => {
        const sorteo = sorteosData[index];
        const sorteoName = sorteo.name || `Sorteo ${index + 1}`;

        openConfirmModal(
            'Eliminar Sorteo',
            `¿Está seguro de que desea eliminar el sorteo "${sorteoName}"? Esta acción no se puede deshacer.`,
            () => {
                setSorteosData(sorteosData.filter((_, i) => i !== index));
            }
        );
    };

    // Funciones para manejar tipos de movimientos de fondo
    const addFondoType = async (category: 'INGRESO' | 'GASTO' | 'EGRESO') => {
        const maxOrder = Math.max(...fondoTypesData.map(t => t.order ?? 0), -1);
        const newType: FondoMovementTypeConfig = {
            category,
            name: '',
            order: maxOrder + 1
        };
        
        try {
            // Agregar a la base de datos inmediatamente
            const newId = await FondoMovementTypesService.addMovementType({
                category,
                name: '',
                order: maxOrder + 1
            });
            
            // Actualizar el estado local con el ID asignado
            const typeWithId = { ...newType, id: newId };
            setFondoTypesData([...fondoTypesData, typeWithId]);
            setOriginalFondoTypesData([...originalFondoTypesData, typeWithId]);
            
            showToast(`Nuevo tipo de ${category} agregado`, 'success');
        } catch (error) {
            console.error('Error adding fondo type:', error);
            showToast('Error al agregar el tipo de movimiento', 'error');
        }
    };

    const updateFondoType = async (index: number, field: keyof FondoMovementTypeConfig, value: string | number) => {
        const updated = [...fondoTypesData];
        updated[index] = { ...updated[index], [field]: value };
        setFondoTypesData(updated);
        
        // Si el tipo tiene ID, guardar automáticamente en la base de datos
        if (updated[index].id && field === 'name') {
            try {
                await FondoMovementTypesService.updateMovementType(updated[index].id!, { name: value as string });
                setOriginalFondoTypesData([...updated]);
            } catch (error) {
                console.error('Error updating fondo type:', error);
                showToast('Error al actualizar el tipo', 'error');
            }
        }
    };

    const removeFondoType = (index: number) => {
        const fondoType = fondoTypesData[index];
        const typeName = fondoType.name || `Tipo ${index + 1}`;

        openConfirmModal(
            'Eliminar Tipo de Movimiento',
            `¿Está seguro de que desea eliminar el tipo "${typeName}"? Esta acción no se puede deshacer.`,
            async () => {
                try {
                    // Eliminar de la base de datos si tiene ID
                    if (fondoType.id) {
                        await FondoMovementTypesService.deleteMovementType(fondoType.id);
                    }
                    
                    const filtered = fondoTypesData.filter((_, i) => i !== index);
                    setFondoTypesData(filtered);
                    setOriginalFondoTypesData(filtered);
                    showToast('Tipo eliminado correctamente', 'success');
                } catch (error) {
                    console.error('Error deleting fondo type:', error);
                    showToast('Error al eliminar el tipo', 'error');
                }
            }
        );
    };

    const moveFondoTypeUp = async (index: number) => {
        if (index === 0) return;
        const updated = [...fondoTypesData];
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        // Update order values
        updated.forEach((item, idx) => {
            item.order = idx;
        });
        setFondoTypesData(updated);
        
        // Guardar cambios de orden en la base de datos
        try {
            const promises = [];
            if (updated[index - 1].id) {
                promises.push(FondoMovementTypesService.updateMovementType(updated[index - 1].id!, { order: index - 1 }));
            }
            if (updated[index].id) {
                promises.push(FondoMovementTypesService.updateMovementType(updated[index].id!, { order: index }));
            }
            await Promise.all(promises);
            setOriginalFondoTypesData([...updated]);
        } catch (error) {
            console.error('Error updating order:', error);
            showToast('Error al actualizar el orden', 'error');
        }
    };

    const moveFondoTypeDown = async (index: number) => {
        if (index === fondoTypesData.length - 1) return;
        const updated = [...fondoTypesData];
        [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
        // Update order values
        updated.forEach((item, idx) => {
            item.order = idx;
        });
        setFondoTypesData(updated);
        
        // Guardar cambios de orden en la base de datos
        try {
            const promises = [];
            if (updated[index].id) {
                promises.push(FondoMovementTypesService.updateMovementType(updated[index].id!, { order: index }));
            }
            if (updated[index + 1].id) {
                promises.push(FondoMovementTypesService.updateMovementType(updated[index + 1].id!, { order: index + 1 }));
            }
            await Promise.all(promises);
            setOriginalFondoTypesData([...updated]);
        } catch (error) {
            console.error('Error updating order:', error);
            showToast('Error al actualizar el orden', 'error');
        }
    };

    const seedFondoTypes = async () => {
        openConfirmModal(
            'Inicializar Tipos de Movimientos',
            '¿Deseas cargar los tipos de movimientos por defecto? Esta acción agregará los tipos que no existan en la base de datos.',
            async () => {
                try {
                    await FondoMovementTypesService.seedInitialData();
                    showToast('Tipos de movimientos inicializados correctamente', 'success');
                    await loadData(); // Reload data to show the new types
                } catch (error) {
                    console.error('Error seeding fondo types:', error);
                    showToast('Error al inicializar los tipos de movimientos', 'error');
                }
            }
        );
    };    // Funciones para manejar usuarios
    const addUser = () => {
        const defaultRole: User['role'] = currentUser?.role === 'superadmin' ? 'admin' : 'user';
        const newUser: User = {
            name: '',
            ownercompanie: '',
            password: '',
            role: defaultRole,
            isActive: true
        };
        // Añadir campos solicitados: email, fullName y eliminate por defecto false
        (newUser as Partial<User>).email = '';
        (newUser as Partial<User>).fullName = '';
        (newUser as Partial<User>).eliminate = false;
        // Preselect ownerId for new users when actor has an owner
        (newUser as Partial<User>).ownerId = currentUser?.ownerId ?? (currentUser && currentUser.eliminate === false ? currentUser.id : '');
        // Insertar al inicio
        // Give new user no permissions by default (no privileges)
        newUser.permissions = getNoPermissions();
        // Assign a temporary local id so per-user keyed state can reference it
        const localId = `local-${Date.now()}`;
        (newUser as unknown as { __localId?: string }).__localId = localId;
        setUsersData(prev => [newUser, ...prev]);

        // Initialize per-user keyed UI state for the new user
        setPasswordVisibility(prev => ({ ...prev, [localId]: false }));
        setPermissionsEditable(prev => ({ ...prev, [localId]: true }));
        setShowPermissions(prev => ({ ...prev, [localId]: true }));
        setPasswordStore(prev => ({ ...prev, [localId]: '' }));
        setPasswordBaseline(prev => ({ ...prev, [localId]: '' }));
        setChangePasswordMode(prev => ({ ...prev, [localId]: false }));
    };

    const updateUser = (index: number, field: keyof User, value: unknown) => {
        if (field === 'password') {
            const key = getUserKey(usersData[index], index);
            const newValue = typeof value === 'string' ? value : '';
            const updated = [...usersData];
            updated[index] = { ...updated[index], password: newValue };
            setUsersData(updated);

            if (newValue.length > 0) {
                setPasswordStore(prev => ({ ...prev, [key]: newValue }));
            } else {
                setPasswordStore(prev => ({ ...prev, [key]: passwordBaseline[key] ?? '' }));
            }
            return;
        }

        const updated = [...usersData];

        // No cambiar permisos automáticamente al cambiar rol. Solo actualizar campo.
        updated[index] = { ...updated[index], [field]: value };

        setUsersData(updated);
    };

    const removeUser = (index: number) => {
        const user = usersData[index];
        const userName = user.name || `Usuario ${index + 1}`;

        openConfirmModal(
            'Eliminar Usuario',
            `¿Está seguro de que desea eliminar al usuario "${userName}"? Esta acción no se puede deshacer.`,
            async () => {
                try {
                    setConfirmModal(prev => ({ ...prev, loading: true }));

                    // Si el usuario tiene id, eliminar en backend primero con validación de actor
                    if (user.id) {
                        await UsersService.deleteUserAs(currentUser, user.id);
                    }

                    // Eliminar del estado local
                    setUsersData(prev => prev.filter((_, i) => i !== index));

                    // Actualizar originalUsersData para eliminarlo también
                    setOriginalUsersData(prev => prev.filter(u => u.id !== user.id && (u as unknown as { __localId?: string }).__localId !== (user as unknown as { __localId?: string }).__localId));

                    const keyToRemove = getUserKey(user, index);
                    setPasswordStore(prev => {
                        const copy = { ...prev };
                        delete copy[keyToRemove];
                        return copy;
                    });
                    setPasswordBaseline(prev => {
                        const copy = { ...prev };
                        delete copy[keyToRemove];
                        return copy;
                    });

                    showToast(`Usuario ${userName} eliminado exitosamente`, 'success');
                } catch (error: unknown) {
                    console.error('Error deleting user:', error);
                    const msg = error instanceof Error ? error.message : String(error || 'Error al eliminar el usuario');
                    showToast(msg.includes('Forbidden') ? 'No tienes permisos para eliminar este usuario' : 'Error al eliminar el usuario', 'error');
                } finally {
                    // Cerrar modal y quitar loading
                    closeConfirmModal();
                }
            }
        );
    };

    // Funciones para manejar visibilidad de contraseñas
    const togglePasswordVisibility = (user: User, index: number) => {
        const key = getUserKey(user, index);
        setPasswordVisibility(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // showPermissions is toggled inline where needed

    // Note: permission-specific auto-save functions were removed because permissions are edited locally
    // and saved when the user presses the 'Guardar' button. Keep UsersService functions available
    // if needed elsewhere.

    // Función para habilitar/deshabilitar todos los permisos con guardado automático
    const setAllUserPermissions = (userIndex: number, value: boolean) => {
        const user = usersData[userIndex];
        const action = value ? 'habilitar todos' : 'deshabilitar todos';

        openConfirmModal(
            `${value ? 'Habilitar' : 'Deshabilitar'} Todos los Permisos`,
            `¿Estás seguro de ${action} los permisos para "${user.name}"?`,
            async () => {
                const updated = [...usersData];
                const permissionKeys: (keyof UserPermissions)[] = [
                    'scanner', 'calculator', 'converter', 'cashcounter',
                    'timingcontrol', 'controlhorario', 'calculohorasprecios', 'supplierorders', 'mantenimiento', 'solicitud', 'scanhistory'
                ];

                if (!updated[userIndex].permissions) {
                    updated[userIndex].permissions = getDefaultPermissions(updated[userIndex].role || 'user');
                }

                const newPermissions: Partial<UserPermissions> = {};
                permissionKeys.forEach(key => {
                    (updated[userIndex].permissions as unknown as Record<string, unknown>)![key] = value;
                    (newPermissions as unknown as Record<string, unknown>)[key] = value;
                });

                // Si se están desactivando todos los permisos, limpiar las empresas seleccionadas
                if (!value) {
                    updated[userIndex].permissions!.scanhistoryEmpresas = [];
                    newPermissions.scanhistoryEmpresas = [];
                }

                setUsersData(updated);

                // Guardar en base de datos si el usuario tiene ID
                if (user.id) {
                    try {
                        const key = getUserKey(user, userIndex);
                        setSavingUserKey(key);
                        await UsersService.updateUserPermissions(user.id, newPermissions);

                        showToast(`Todos los permisos ${value ? 'habilitados' : 'deshabilitados'} para ${user.name}`, 'success', 3000);

                    } catch (error) {
                        console.error('Error updating all user permissions:', error);
                        showToast(`Error al actualizar permisos para ${user.name}`, 'error', 5000);
                    } finally {
                        setSavingUserKey(null);
                    }
                }
            }
        );
    };

    // Función para obtener etiquetas de permisos
    const getPermissionLabel = (permission: string): string => {
        const labels: { [key: string]: string } = {
            scanner: 'Escáner',
            calculator: 'Calculadora',
            converter: 'Conversor',
            cashcounter: 'Contador Efectivo',
            timingcontrol: 'Control Tiempos',
            controlhorario: 'Control Horario',
            calculohorasprecios: 'Calculo Horas Precios',
            supplierorders: 'Órdenes Proveedor',
            mantenimiento: 'Mantenimiento',
            solicitud: 'Solicitud',
            scanhistory: 'Historial de Escaneos',
        };
        return labels[permission] || permission;
    };

    // Función para obtener descripciones de permisos
    const getPermissionDescription = (permission: string): string => {
        const descriptions: { [key: string]: string } = {
            scanner: 'Escanear códigos de barras',
            calculator: 'Calcular precios con descuentos',
            converter: 'Convertir y transformar texto',
            cashcounter: 'Contar billetes y monedas',
            timingcontrol: 'Registro de venta de tiempos',
            controlhorario: 'Registro de horarios de trabajo',
            calculohorasprecios: 'Cálculo de horas y precios (planilla)',
            supplierorders: 'Gestión de órdenes de proveedores',
            mantenimiento: 'Acceso al panel de administración',
            solicitud: 'Permite gestionar solicitudes dentro del módulo de mantenimiento',
            scanhistory: 'Ver historial completo de escaneos realizados',
        };
        return descriptions[permission] || permission;
    };

    // Función para renderizar la lista de permisos editables
    const renderUserPermissions = (user: User, index: number) => {
        const defaultPermissions = getDefaultPermissions(user.role || 'user');
        const userPermissions = { ...defaultPermissions, ...(user.permissions || {}) };
        // allow editing permissions for new users; only disable while saving
        const key = getUserKey(user, index);
        const isDisabled = savingUserKey === key;

        return (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                    <span className="text-sm sm:text-base font-medium" style={{ color: 'var(--foreground)' }}>Permisos de Usuario:</span>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        {savingUserKey === key && (
                            <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-600 dark:text-blue-400 order-first sm:order-none">
                                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
                                <span>Guardando...</span>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setAllUserPermissions(index, true)}
                                disabled={isDisabled}
                                className="text-xs sm:text-sm px-3 py-2 bg-[var(--success)] text-white rounded-md hover:bg-[var(--button-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                            >
                                <span className="hidden sm:inline">Habilitar Todo</span>
                                <span className="sm:hidden flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Todo
                                </span>
                            </button>
                            <button
                                onClick={() => setAllUserPermissions(index, false)}
                                disabled={isDisabled}
                                className="text-xs sm:text-sm px-3 py-2 bg-[var(--error)] text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                            >
                                <span className="hidden sm:inline">Deshabilitar Todo</span>
                                <span className="sm:hidden flex items-center gap-1">
                                    <X className="w-3 h-3" />
                                    Todo
                                </span>
                            </button>
                            <button
                                onClick={() => setPermissionsEditable(prev => ({ ...prev, [key]: !prev[key] }))}
                                className="text-xs sm:text-sm px-3 py-2 bg-[var(--secondary)] text-white rounded-md hover:opacity-90 transition-colors whitespace-nowrap"
                            >
                                {permissionsEditable[key] ? (
                                    <span className="hidden sm:inline">Bloquear Permisos</span>
                                ) : (
                                    <span className="hidden sm:inline">Editar Permisos</span>
                                )}
                                <span className="sm:hidden flex items-center gap-1">
                                    {permissionsEditable[key] ? <Lock className="w-3 h-3" /> : <Edit className="w-3 h-3" />}
                                </span>
                            </button>
                            <button
                                onClick={() => setShowPermissions(prev => ({ ...prev, [key]: !prev[key] }))}
                                className="text-xs sm:text-sm px-3 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--button-hover)] transition-colors whitespace-nowrap"
                            >
                                {showPermissions[key] ? (
                                    <span className="hidden sm:inline">Vista Compacta</span>
                                ) : (
                                    <span className="hidden sm:inline">Vista Detallada</span>
                                )}
                                <span className="sm:hidden flex items-center gap-1">
                                    {showPermissions[key] ? <Smartphone className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {showPermissions[key] ? (
                    // Vista detallada con checkboxes editables
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                        {Object.entries(userPermissions)
                            .filter(([permission]) => permission !== 'scanhistoryEmpresas' && permission !== 'scanhistoryLocations')
                            .map(([permission, hasAccess]) => (
                                <div
                                    key={permission}
                                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border-2 rounded-lg transition-all ${hasAccess
                                        ? 'border-[var(--success)] bg-[var(--muted)] hover:opacity-90'
                                        : 'border-[var(--border)] bg-[var(--card-bg)] hover:opacity-90'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        id={`${index}-${permission}`}
                                        checked={Boolean(hasAccess)}
                                        disabled={!permissionsEditable[key] || isDisabled}
                                        onChange={(e) => {
                                            // Only update in local state; do not auto-save
                                            const updated = [...usersData];
                                            if (!updated[index].permissions) {
                                                updated[index].permissions = getDefaultPermissions(updated[index].role || 'user');
                                            }
                                            (updated[index].permissions as unknown as Record<string, unknown>)[permission] = e.target.checked;
                                            setUsersData(updated);
                                        }}
                                        className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--success)] border-2 rounded focus:ring-[var(--success)] focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            backgroundColor: 'var(--input-bg)',
                                            borderColor: 'var(--input-border)'
                                        }}
                                    />
                                    <label
                                        htmlFor={`${index}-${permission}`}
                                        className="cursor-pointer flex-1"
                                    >
                                        <div className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{getPermissionLabel(permission)}</div>
                                        <div className="text-xs sm:text-sm" style={{ color: 'var(--muted-foreground)' }}>{getPermissionDescription(permission)}</div>
                                    </label>
                                    <div className={`px-1 sm:px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${hasAccess
                                        ? 'bg-[var(--success)] text-white'
                                        : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                                        }`}>
                                        <span className="hidden sm:inline">{hasAccess ? 'Activo' : 'Inactivo'}</span>
                                        <span className="sm:hidden">{hasAccess ? 'On' : 'Off'}</span>
                                    </div>
                                </div>
                            ))}
                    </div>
                ) : (
                    // Vista compacta con indicadores
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                        {Object.entries(userPermissions)
                            .filter(([permission]) => permission !== 'scanhistoryEmpresas' && permission !== 'scanhistoryLocations')
                            .map(([permission, hasAccess]) => (
                                <label
                                    key={permission}
                                    className={`flex items-center gap-1 text-xs sm:text-sm px-2 py-1 rounded cursor-pointer border transition-colors ${hasAccess
                                        ? 'bg-[var(--success)] text-white border-[var(--success)] hover:opacity-90'
                                        : 'bg-[var(--error)] text-white border-[var(--error)] hover:opacity-90'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={Boolean(hasAccess)}
                                        disabled={!permissionsEditable[key] || isDisabled}
                                        onChange={(e) => {
                                            const updated = [...usersData];
                                            if (!updated[index].permissions) {
                                                updated[index].permissions = getDefaultPermissions(updated[index].role || 'user');
                                            }
                                            (updated[index].permissions as unknown as Record<string, unknown>)[permission] = e.target.checked;
                                            setUsersData(updated);
                                        }}
                                        className="w-3 h-3 disabled:opacity-50"
                                    />
                                    <span className="hidden sm:inline">{getPermissionLabel(permission)}</span>
                                    <span className="sm:hidden">{getPermissionLabel(permission).split(' ')[0]}</span>
                                </label>
                            ))}
                    </div>
                )}

                {/* Selector de empresas para scanhistory */}
                {userPermissions.scanhistory && (
                    <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <div className="mb-3 sm:mb-4">
                            <h4 className="font-medium text-sm sm:text-base mb-2" style={{ color: 'var(--foreground)' }}>
                                Empresas para Historial de Escaneos
                            </h4>
                            <p className="text-xs sm:text-sm" style={{ color: 'var(--muted-foreground)' }}>
                                Selecciona las empresas específicas a las que este usuario tendrá acceso en el historial de escaneos.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                            {empresasData
                                .filter((empresa) => {
                                    // Mostrar solo empresas dentro del alcance del actor (ownerId match)
                                    if (actorOwnerIdSet.size === 0) return true;
                                    return empresa.ownerId && actorOwnerIdSet.has(String(empresa.ownerId));
                                })
                                .map((empresa) => (
                                    <label
                                        key={empresa.id || empresa.name}
                                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            // almacenamos por empresa.name para mantener compatibilidad con la estructura actual
                                            checked={userPermissions.scanhistoryEmpresas?.includes(empresa.name) || false}
                                            disabled={!permissionsEditable[key] || isDisabled}
                                            onChange={(e) => {
                                                const updated = [...usersData];
                                                if (!updated[index].permissions) {
                                                    updated[index].permissions = getDefaultPermissions(updated[index].role || 'user');
                                                }
                                                const current = updated[index].permissions!.scanhistoryEmpresas || [];
                                                const newList = e.target.checked ? [...current, empresa.name] : current.filter(l => l !== empresa.name);
                                                updated[index].permissions!.scanhistoryEmpresas = newList;
                                                setUsersData(updated);
                                            }}
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                                        />
                                        <span className="flex-1 truncate" style={{ color: 'var(--foreground)' }}>{empresa.name}</span>
                                    </label>
                                ))}
                        </div>
                        {userPermissions.scanhistoryEmpresas && userPermissions.scanhistoryEmpresas.length > 0 && (
                            <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md">
                                <p className="text-xs sm:text-sm" style={{ color: 'var(--foreground)' }}>
                                    <strong className="text-green-700 dark:text-green-300">Empresas seleccionadas:</strong>
                                    <span className="ml-1 text-green-600 dark:text-green-400">
                                        {userPermissions.scanhistoryEmpresas.join(', ')}
                                    </span>
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Función para guardar usuario individual
    const saveIndividualUser = async (index: number) => {
        const key = getUserKey(usersData[index], index);
        setSavingUserKey(key);
        try {
            const user = usersData[index];
            if (user.id) {
                // Actualizar usuario existente (actor-aware)
                // Clean stale properties before saving
                const permissionsToSave = { ...(user.permissions || {}) } as Record<string, unknown>;
                const storedPassword = passwordStore[key] ?? '';
                const baselinePassword = passwordBaseline[key] ?? '';
                const passwordHasInput = typeof user.password === 'string' && user.password.length > 0;
                const shouldUpdatePassword = passwordHasInput || (storedPassword.length > 0 && storedPassword !== baselinePassword);

                const updatePayload: Partial<User> = {
                    name: user.name,
                    role: user.role,
                    isActive: user.isActive,
                    permissions: permissionsToSave as any,
                    email: user.email,
                    fullName: user.fullName,
                    maxCompanies: user.maxCompanies,
                    eliminate: user.eliminate ?? false,
                    ownerId: user.ownerId,
                    ownercompanie: user.ownercompanie
                };

                if (shouldUpdatePassword) {
                    updatePayload.password = storedPassword;
                }

                await UsersService.updateUserAs(currentUser, user.id, updatePayload);

                const refreshed = await UsersService.getUserById(user.id);

                if (refreshed) {
                    const sanitizedRefreshed = { ...refreshed, password: '' } as User;

                    setUsersData(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], ...sanitizedRefreshed };
                        return updated;
                    });

                    setOriginalUsersData(prev => {
                        try {
                            const copy = JSON.parse(JSON.stringify(prev)) as User[];
                            const idx = copy.findIndex(u => u.id === user.id);
                            if (idx !== -1) {
                                copy[idx] = JSON.parse(JSON.stringify(sanitizedRefreshed));
                            }
                            return copy;
                        } catch {
                            return prev;
                        }
                    });

                    const refreshedPassword = typeof refreshed.password === 'string' ? refreshed.password : '';
                    setPasswordStore(prev => ({ ...prev, [key]: refreshedPassword }));
                    setPasswordBaseline(prev => ({ ...prev, [key]: refreshedPassword }));
                } else {
                    setUsersData(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], password: '' };
                        return updated;
                    });

                    if (shouldUpdatePassword) {
                        setPasswordStore(prev => ({ ...prev, [key]: storedPassword }));
                        setPasswordBaseline(prev => ({ ...prev, [key]: storedPassword }));
                    }
                }

                // Bloquear edición de permisos para este usuario después de guardar
                setPermissionsEditable(prev => ({ ...prev, [key]: false }));
                // Resetear modo de cambio de contraseña
                setChangePasswordMode(prev => ({ ...prev, [key]: false }));
            } else {
                // Crear nuevo usuario (actor-aware)
                const permissionsToCreate = { ...(user.permissions || {}) } as Record<string, unknown>;
                await UsersService.createUserAs(currentUser, {
                    name: user.name,
                    password: passwordStore[key] ?? user.password,
                    role: user.role,
                    isActive: user.isActive,
                    permissions: permissionsToCreate as any,
                    maxCompanies: user.maxCompanies,
                    email: user.email,
                    fullName: user.fullName,
                    eliminate: user.eliminate ?? false,
                    ownerId: user.ownerId,
                    ownercompanie: user.ownercompanie
                });
                // Recargar datos para obtener el ID generado
                await loadData();
                // Después de recargar datos, asegurar que el control de edición de permisos está bloqueado
                setPermissionsEditable(prev => ({ ...prev, [key]: false }));
                // Resetear modo de cambio de contraseña
                setChangePasswordMode(prev => ({ ...prev, [key]: false }));
            }
            showToast(`Usuario ${user.name} guardado exitosamente`, 'success');
            // Clear global changes flag so UI removes "Cambios pendientes" badges
            setHasChanges(false);
        } catch (error) {
            showToast('Error al guardar el usuario', 'error');
            console.error('Error saving user:', error);
        } finally {
            setSavingUserKey(null);
        }
    };

    // (locations individual save removed with locations tab)

    // Funciones para manejar configuración CCSS
    const addCcssConfig = () => {
        const ownerId = resolveOwnerIdForActor();

        // Verificar si ya existe un config para este owner
        const existingConfigIndex = ccssConfigsData.findIndex(config => config.ownerId === ownerId);

        if (existingConfigIndex !== -1) {
            // Si existe, agregar una nueva company al array
            const updatedConfigs = [...ccssConfigsData];
            updatedConfigs[existingConfigIndex] = {
                ...updatedConfigs[existingConfigIndex],
                companie: [
                    ...updatedConfigs[existingConfigIndex].companie,
                    {
                        ownerCompanie: '',
                        mt: 3672.46,
                        tc: 11017.39,
                        valorhora: 1441,
                        horabruta: 1529.62
                    }
                ]
            };
            setCcssConfigsData(updatedConfigs);
        } else {
            // Si no existe, crear un nuevo config con una company
            const newConfig: CcssConfig = {
                ownerId,
                companie: [{
                    ownerCompanie: '',
                    mt: 3672.46,
                    tc: 11017.39,
                    valorhora: 1441,
                    horabruta: 1529.62
                }]
            };
            setCcssConfigsData([...ccssConfigsData, newConfig]);
        }
    };

    const updateCcssConfig = (configIndex: number, companyIndex: number, field: string, value: string | number) => {
        const updated = [...ccssConfigsData];
        const updatedCompanies = [...updated[configIndex].companie];

        if (field === 'ownerCompanie') {
            updatedCompanies[companyIndex] = {
                ...updatedCompanies[companyIndex],
                ownerCompanie: value as string
            };
        } else if (['mt', 'tc', 'valorhora', 'horabruta'].includes(field)) {
            updatedCompanies[companyIndex] = {
                ...updatedCompanies[companyIndex],
                [field]: value as number
            };
        }

        updated[configIndex] = {
            ...updated[configIndex],
            companie: updatedCompanies
        };
        setCcssConfigsData(updated);
    };

    // Función auxiliar para aplanar los datos de CCSS para la UI
    const getFlattenedCcssData = () => {
        const flattened: Array<{
            configIndex: number;
            companyIndex: number;
            config: CcssConfig;
            company: companies;
        }> = [];

        ccssConfigsData.forEach((config, configIndex) => {
            config.companie.forEach((company, companyIndex) => {
                flattened.push({
                    configIndex,
                    companyIndex,
                    config,
                    company
                });
            });
        });

        return flattened;
    };

    const removeCcssConfig = (configIndex: number, companyIndex: number) => {
        const config = ccssConfigsData[configIndex];
        const company = config.companie[companyIndex];
        const configName = company.ownerCompanie || `Configuración ${configIndex + 1}-${companyIndex + 1}`;

        openConfirmModal(
            'Eliminar Configuración CCSS',
            `¿Está seguro de que desea eliminar la configuración para "${configName}"? Esta acción no se puede deshacer.`,
            async () => {
                try {
                    const updatedConfigs = [...ccssConfigsData];
                    const updatedCompanies = [...updatedConfigs[configIndex].companie];

                    // Remover la company específica
                    updatedCompanies.splice(companyIndex, 1);

                    if (updatedCompanies.length === 0) {
                        // Si no quedan companies, eliminar todo el config
                        if (config.id) {
                            await CcssConfigService.deleteCcssConfig(config.id);
                        }
                        updatedConfigs.splice(configIndex, 1);
                    } else {
                        // Si quedan companies, actualizar el config
                        updatedConfigs[configIndex] = {
                            ...updatedConfigs[configIndex],
                            companie: updatedCompanies
                        };
                        if (config.id) {
                            await CcssConfigService.updateCcssConfig(updatedConfigs[configIndex]);
                        }
                    }

                    setCcssConfigsData(updatedConfigs);
                    showToast(`Configuración para ${configName} eliminada exitosamente`, 'success');
                } catch (error) {
                    console.error('Error deleting CCSS config:', error);
                    showToast('Error al eliminar la configuración', 'error');
                }
            }
        );
    };

    return (
        <div className="w-full max-w-7xl mx-auto bg-[var(--card-bg)] rounded-lg shadow py-3 px-2 sm:py-4 sm:px-3 md:py-6 md:px-4 lg:px-6">            {/* Loading Modal */}
            {isSaving && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
                    <div className="bg-[var(--card-bg)] rounded-xl p-8 flex flex-col items-center justify-center shadow-2xl border border-[var(--input-border)] max-w-sm mx-4 animate-scale-in">
                        <div className="relative flex items-center justify-center mb-6">
                            {/* Outer pulse ring */}
                            <div className="absolute inset-0 rounded-full animate-ping bg-blue-400 opacity-20"></div>
                            {/* Clock SVG */}
                            <svg className="animate-spin w-16 h-16 text-blue-600 relative z-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="4" opacity="0.2" />
                                <line x1="24" y1="24" x2="24" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                <line x1="24" y1="24" x2="36" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="text-xl font-semibold text-[var(--foreground)] mb-3">
                            Guardando cambios...
                        </div>
                        <div className="text-sm text-[var(--muted-foreground)] text-center leading-relaxed">
                            Por favor espera mientras se actualizan<br />
                            los datos en Firebase
                        </div>
                        {/* Progress bar animation */}
                        <div className="w-full max-w-xs mt-4">
                            <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full animate-shimmer bg-[length:200%_100%]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* notifications now use global ToastProvider */}


            {/* File Tabs */}
            <div className="mb-4 sm:mb-6">
                <div className="border-b border-[var(--input-border)] overflow-x-auto scrollbar-hide">
                    <nav className="flex gap-1 sm:gap-2 -mb-px min-w-max">
                        <button
                            onClick={() => setActiveFile('users')}
                            className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'users'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                }`}
                        >
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Usuarios ({usersData.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveFile('sorteos')}
                            className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'sorteos'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                }`}
                        >
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Sorteos ({sorteosData.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveFile('schedules')}
                            className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'schedules'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                }`}
                        >
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Planilla</span>
                        </button>
                        <button
                            onClick={() => setActiveFile('ccss')}
                            className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'ccss'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                }`}
                        >
                            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>CCSS ({ccssConfigsData.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveFile('empresas')}
                            className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'empresas'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                }`}
                        >
                            <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Empresas ({empresasData.length})</span>
                        </button>
                        {currentUser?.role !== 'user' && (
                            <button
                                onClick={() => setActiveFile('fondoTypes')}
                                className={`py-1.5 sm:py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 whitespace-nowrap transition-colors ${activeFile === 'fondoTypes'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:border-[var(--border)]'
                                    }`}
                            >
                                <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span>Tipos Fondo ({fondoTypesData.length})</span>
                            </button>
                        )}
                        <button
                            onClick={openExportModal}
                            className="py-1.5 sm:py-2 px-2 sm:px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ml-auto"
                        >
                            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Exportar</span>
                        </button>
                    </nav>

                </div>

            </div>

            {/* Content */}


            {activeFile === 'empresas' && (
                <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div>
                            <h4 className="text-base sm:text-lg lg:text-xl font-semibold">Configuración de Empresas</h4>
                            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mt-0.5 sm:mt-1">
                                Gestiona las empresas y sus configuraciones
                            </p>
                        </div>
                        <button
                            onClick={() =>
                                setEmpresasData(prev => [
                                    ...prev,
                                    {
                                        ownerId: currentUser && currentUser.eliminate === false ? currentUser.id : '',
                                        name: '',
                                        ubicacion: '',
                                        empleados: [
                                            {
                                                Empleado: '',
                                                hoursPerShift: 8,
                                                extraAmount: 0,
                                                ccssType: 'TC',
                                                calculoprecios: false,
                                                amboshorarios: false
                                            }
                                        ]
                                    }
                                ])
                            }
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs sm:text-sm w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                        >
                            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Agregar Empresa</span>
                        </button>
                    </div>

                    {empresasData.map((empresa, idx) => (
                        <div key={empresa.id || idx} className="border border-[var(--input-border)] rounded-lg p-2.5 sm:p-4 lg:p-5 relative">
                            <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-3 sm:mb-4">
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Nombre de la empresa:</label>
                                    <input
                                        type="text"
                                        value={empresa.name || ''}
                                        onChange={(e) => {
                                            const copy = [...empresasData];
                                            copy[idx] = { ...copy[idx], name: e.target.value };
                                            setEmpresasData(copy);
                                        }}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Ubicación:</label>
                                    <input
                                        type="text"
                                        value={empresa.ubicacion || ''}
                                        onChange={(e) => {
                                            const copy = [...empresasData];
                                            copy[idx] = { ...copy[idx], ubicacion: e.target.value };
                                            setEmpresasData(copy);
                                        }}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                    />
                                </div>
                            </div>

                            <div className="mt-4 sm:mt-5">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                                    <label className="block text-xs sm:text-sm font-medium">Empleados:</label>
                                    <button
                                        onClick={() => {
                                            const copy = [...empresasData];
                                            if (!copy[idx].empleados) copy[idx].empleados = [];
                                            copy[idx].empleados.push({
                                                Empleado: '',
                                                hoursPerShift: 8,
                                                extraAmount: 0,
                                                ccssType: 'TC',
                                                calculoprecios: false,
                                                amboshorarios: false
                                            });
                                            setEmpresasData(copy);
                                        }}
                                        className="text-xs sm:text-sm bg-green-600 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md hover:bg-green-700 transition-colors w-full sm:w-auto flex items-center justify-center gap-1.5 whitespace-nowrap"
                                    >
                                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        <span>Agregar Empleado</span>
                                    </button>
                                </div>

                                <div className="space-y-2 sm:space-y-3">
                                    {empresa.empleados?.map((emp: any, eIdx: number) => (
                                        <div key={eIdx} className="p-2 sm:p-3 border border-[var(--input-border)] rounded-lg bg-[var(--card-bg)]">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] sm:text-xs font-medium mb-1">Empleado</label>
                                                    <input
                                                        type="text"
                                                        value={emp.Empleado}
                                                        onChange={(ev) => {
                                                            const copy = [...empresasData];
                                                            copy[idx].empleados[eIdx].Empleado = ev.target.value;
                                                            setEmpresasData(copy);
                                                        }}
                                                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                        placeholder="Nombre"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] sm:text-xs font-medium mb-1">Horas/turno</label>
                                                    <input
                                                        type="number"
                                                        value={emp.hoursPerShift ?? 8}
                                                        onChange={(ev) => {
                                                            const copy = [...empresasData];
                                                            copy[idx].empleados[eIdx].hoursPerShift = parseInt(ev.target.value) || 0;
                                                            setEmpresasData(copy);
                                                        }}
                                                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                        min="0"
                                                        step="0.5"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] sm:text-xs font-medium mb-1">Monto extra</label>
                                                    <input
                                                        type="number"
                                                        value={emp.extraAmount ?? 0}
                                                        onChange={(ev) => {
                                                            const copy = [...empresasData];
                                                            copy[idx].empleados[eIdx].extraAmount = parseFloat(ev.target.value) || 0;
                                                            setEmpresasData(copy);
                                                        }}
                                                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] sm:text-xs font-medium mb-1">Tipo CCSS</label>
                                                    <select
                                                        value={emp.ccssType || 'TC'}
                                                        onChange={(ev) => {
                                                            const copy = [...empresasData];
                                                            copy[idx].empleados[eIdx].ccssType = ev.target.value;
                                                            setEmpresasData(copy);
                                                        }}
                                                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                    >
                                                        <option value="TC">Tiempo Completo</option>
                                                        <option value="MT">Medio Tiempo</option>
                                                    </select>
                                                </div>

                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] sm:text-xs font-medium mb-1">Horarios</label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        <label className="flex items-center gap-2 text-xs sm:text-sm">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(emp.amboshorarios)}
                                                                onChange={(ev) => {
                                                                    const copy = [...empresasData];
                                                                    copy[idx].empleados[eIdx].amboshorarios = ev.target.checked;
                                                                    setEmpresasData(copy);
                                                                }}
                                                            />
                                                            Ambos horarios
                                                        </label>

                                                        <label className="flex items-center gap-2 text-xs sm:text-sm">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(emp.calculoprecios)}
                                                                onChange={(ev) => {
                                                                    const copy = [...empresasData];
                                                                    copy[idx].empleados[eIdx].calculoprecios = ev.target.checked;
                                                                    setEmpresasData(copy);
                                                                }}
                                                            />
                                                            Cálculo precios
                                                        </label>
                                                    </div>
                                                    <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)] mt-1">
                                                        Si “Ambos horarios” está activo, tiene prioridad.
                                                    </p>
                                                </div>
                                                <div className="sm:col-span-2 flex justify-end mt-2 pt-2 border-t border-[var(--input-border)]">
                                                    <button
                                                        onClick={() => {
                                                            openConfirmModal(
                                                                'Eliminar Empleado',
                                                                `¿Desea eliminar al empleado ${emp.Empleado || `N°${eIdx + 1}`}?`,
                                                                () => {
                                                                    const copy = [...empresasData];
                                                                    copy[idx].empleados = copy[idx].empleados.filter((_: unknown, i: number) => i !== eIdx);
                                                                    setEmpresasData(copy);
                                                                }
                                                            );
                                                        }}
                                                        className="text-xs sm:text-sm px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-1"
                                                    >
                                                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                                        <span className="hidden sm:inline">Eliminar</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-2">
                                <button
                                    onClick={async () => {
                                        // Save single empresa
                                        try {
                                            const e = empresasData[idx];
                                            if (e.id) {
                                                await EmpresasService.updateEmpresa(e.id, e);
                                                showToast('Empresa actualizada', 'success');
                                            } else {
                                                const ownerIdToUse = resolveOwnerIdForActor(e.ownerId);
                                                const idToUse = e.name && e.name.trim() !== '' ? e.name.trim() : undefined;
                                                if (!idToUse) {
                                                    showToast('El nombre (name) es requerido para crear la empresa con id igual a name', 'error');
                                                } else {
                                                    try {
                                                        await EmpresasService.addEmpresa({ id: idToUse, ownerId: ownerIdToUse, name: e.name || '', ubicacion: e.ubicacion || '', empleados: e.empleados || [] });
                                                        await loadData();
                                                        showToast('Empresa creada', 'success');
                                                    } catch (err) {
                                                        const message = err && (err as Error).message ? (err as Error).message : 'Error al guardar empresa';
                                                        // If it's owner limit, show modal with explanation; otherwise fallback to notification
                                                        if (message.includes('maximum allowed companies') || message.toLowerCase().includes('max')) {
                                                            openConfirmModal('Límite de empresas', message, () => { /* sólo cerrar */ }, { singleButton: true, singleButtonText: 'Cerrar' });
                                                        } else {
                                                            showToast('Error al guardar empresa', 'error');
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (err) {
                                            console.error('Error saving empresa:', err);
                                            showToast('Error al guardar empresa', 'error');
                                        }
                                    }}
                                    className="px-3 py-2 sm:px-4 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors text-sm sm:text-base"
                                >
                                    Guardar Empresa
                                </button>
                                <button
                                    onClick={() => openConfirmModal('Eliminar Empresa', '¿Desea eliminar esta empresa?', async () => {
                                        try {
                                            const e = empresasData[idx];
                                            if (e.id) await EmpresasService.deleteEmpresa(e.id);
                                            setEmpresasData(prev => prev.filter((_, i) => i !== idx));
                                            showToast('Empresa eliminada', 'success');
                                        } catch (err) {
                                            console.error('Error deleting empresa:', err);
                                            showToast('Error al eliminar empresa', 'error');
                                        }
                                    })}
                                    className="px-3 py-2 sm:px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm sm:text-base"
                                >
                                    Eliminar Empresa
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeFile === 'sorteos' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
                        <div>
                            <h4 className="text-lg sm:text-xl font-semibold">Configuración de Sorteos</h4>
                            <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                Gestiona los sorteos disponibles en el sistema
                            </p>
                        </div>
                        <button
                            onClick={addSorteo}
                            className="px-4 py-2 sm:px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm sm:text-base w-full sm:w-auto"
                        >
                            <span className="hidden sm:inline">Agregar Sorteo</span>
                            <span className="sm:hidden">+ Sorteo</span>
                        </button>
                    </div>

                    {sorteosData.map((sorteo, index) => (
                        <div key={sorteo.id || index} className="border border-[var(--input-border)] rounded-lg p-3 sm:p-4 md:p-6">
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
                                <div className="flex-1 w-full">
                                    <label className="block text-sm font-medium mb-1">Nombre del Sorteo:</label>
                                    <input
                                        type="text"
                                        value={sorteo.name}
                                        onChange={(e) => updateSorteo(index, 'name', e.target.value)}
                                        className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                        placeholder="Ingrese el nombre del sorteo"
                                    />
                                </div>

                                <button
                                    onClick={() => removeSorteo(index)}
                                    className="px-3 py-2 sm:px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm sm:text-base w-full sm:w-auto mt-2 sm:mt-0 whitespace-nowrap"
                                >
                                    <span className="hidden sm:inline">Eliminar</span>
                                    <span className="sm:hidden">Delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeFile === 'fondoTypes' && currentUser?.role !== 'user' && (
                <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div>
                            <h4 className="text-base sm:text-lg lg:text-xl font-semibold">Tipos de Movimientos de Fondo</h4>
                            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mt-0.5 sm:mt-1">
                                Gestiona los tipos de movimientos disponibles
                            </p>
                        </div>
                        {fondoTypesData.length === 0 && (
                            <button
                                onClick={seedFondoTypes}
                                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 w-full sm:w-auto whitespace-nowrap"
                            >
                                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                Inicializar Tipos
                            </button>
                        )}
                    </div>

                    {/* Sección INGRESO */}
                    <div className="border border-green-200 dark:border-green-700 rounded-lg p-2.5 sm:p-3 lg:p-4 bg-green-50 dark:bg-green-900/10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 sm:mb-3">
                            <h5 className="text-sm sm:text-base lg:text-lg font-semibold text-green-700 dark:text-green-300">INGRESO</h5>
                            <button
                                onClick={() => addFondoType('INGRESO')}
                                className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto whitespace-nowrap"
                            >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                Agregar
                            </button>
                        </div>
                        <div className="space-y-1.5 sm:space-y-2">
                            {fondoTypesData
                                .map((type, index) => ({ type, originalIndex: index }))
                                .filter(({ type }) => type.category === 'INGRESO')
                                .map(({ type, originalIndex }, relativeIndex, arr) => (
                                    <div key={type.id || originalIndex} className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-gray-800 p-2 sm:p-2.5 lg:p-3 rounded-md border border-green-300 dark:border-green-600">
                                        <div className="flex flex-col gap-0.5 sm:gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => moveFondoTypeUp(originalIndex)}
                                                disabled={relativeIndex === 0}
                                                className="p-0.5 sm:p-1 text-green-600 hover:text-green-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Arriba"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                onClick={() => moveFondoTypeDown(originalIndex)}
                                                disabled={relativeIndex === arr.length - 1}
                                                className="p-0.5 sm:p-1 text-green-600 hover:text-green-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Abajo"
                                            >
                                                ▼
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={type.name}
                                            onChange={(e) => updateFondoType(originalIndex, 'name', e.target.value)}
                                            className="flex-1 min-w-0 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-green-300 dark:border-green-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm"
                                            placeholder="Nombre"
                                        />
                                        <button
                                            onClick={() => removeFondoType(originalIndex)}
                                            className="p-1.5 sm:px-2.5 sm:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex-shrink-0"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Sección GASTO */}
                    <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-2.5 sm:p-3 lg:p-4 bg-orange-50 dark:bg-orange-900/10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 sm:mb-3">
                            <h5 className="text-sm sm:text-base lg:text-lg font-semibold text-orange-700 dark:text-orange-300">GASTO</h5>
                            <button
                                onClick={() => addFondoType('GASTO')}
                                className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto whitespace-nowrap"
                            >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                Agregar
                            </button>
                        </div>
                        <div className="space-y-1.5 sm:space-y-2">
                            {fondoTypesData
                                .map((type, index) => ({ type, originalIndex: index }))
                                .filter(({ type }) => type.category === 'GASTO')
                                .map(({ type, originalIndex }, relativeIndex, arr) => (
                                    <div key={type.id || originalIndex} className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-gray-800 p-2 sm:p-2.5 lg:p-3 rounded-md border border-orange-300 dark:border-orange-600">
                                        <div className="flex flex-col gap-0.5 sm:gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => moveFondoTypeUp(originalIndex)}
                                                disabled={relativeIndex === 0}
                                                className="p-0.5 sm:p-1 text-orange-600 hover:text-orange-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Arriba"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                onClick={() => moveFondoTypeDown(originalIndex)}
                                                disabled={relativeIndex === arr.length - 1}
                                                className="p-0.5 sm:p-1 text-orange-600 hover:text-orange-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Abajo"
                                            >
                                                ▼
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={type.name}
                                            onChange={(e) => updateFondoType(originalIndex, 'name', e.target.value)}
                                            className="flex-1 min-w-0 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-orange-300 dark:border-orange-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm"
                                            placeholder="Nombre"
                                        />
                                        <button
                                            onClick={() => removeFondoType(originalIndex)}
                                            className="p-1.5 sm:px-2.5 sm:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex-shrink-0"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Sección EGRESO */}
                    <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-2.5 sm:p-3 lg:p-4 bg-blue-50 dark:bg-blue-900/10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 sm:mb-3">
                            <h5 className="text-sm sm:text-base lg:text-lg font-semibold text-blue-700 dark:text-blue-300">EGRESO</h5>
                            <button
                                onClick={() => addFondoType('EGRESO')}
                                className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto whitespace-nowrap"
                            >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                Agregar
                            </button>
                        </div>
                        <div className="space-y-1.5 sm:space-y-2">
                            {fondoTypesData
                                .map((type, index) => ({ type, originalIndex: index }))
                                .filter(({ type }) => type.category === 'EGRESO')
                                .map(({ type, originalIndex }, relativeIndex, arr) => (
                                    <div key={type.id || originalIndex} className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-gray-800 p-2 sm:p-2.5 lg:p-3 rounded-md border border-blue-300 dark:border-blue-600">
                                        <div className="flex flex-col gap-0.5 sm:gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => moveFondoTypeUp(originalIndex)}
                                                disabled={relativeIndex === 0}
                                                className="p-0.5 sm:p-1 text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Arriba"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                onClick={() => moveFondoTypeDown(originalIndex)}
                                                disabled={relativeIndex === arr.length - 1}
                                                className="p-0.5 sm:p-1 text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm"
                                                title="Abajo"
                                            >
                                                ▼
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={type.name}
                                            onChange={(e) => updateFondoType(originalIndex, 'name', e.target.value)}
                                            className="flex-1 min-w-0 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm"
                                            placeholder="Nombre"
                                        />
                                        <button
                                            onClick={() => removeFondoType(originalIndex)}
                                            className="p-1.5 sm:px-2.5 sm:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex-shrink-0"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {activeFile === 'users' && (
                <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div>
                            <h4 className="text-base sm:text-lg lg:text-xl font-semibold">Configuración de Usuarios</h4>
                            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mt-0.5 sm:mt-1">
                                Gestiona usuarios, roles y permisos del sistema
                            </p>
                        </div>
                        <button
                            onClick={addUser}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs sm:text-sm w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                        >
                            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Agregar Usuario</span>
                        </button>
                    </div>

                    {usersData.map((user, index) => (
                        <div key={user.id || index} className="border border-[var(--input-border)] rounded-lg p-2.5 sm:p-4 lg:p-5 relative">
                            {hasUserChanged(index) && (
                                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] sm:text-xs font-medium">
                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                    <span>Pendiente</span>
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Usuario:</label>
                                    <input
                                        type="text"
                                        value={user.name}
                                        onChange={(e) => updateUser(index, 'name', e.target.value)}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                        placeholder="Nombre de usuario"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Nombre Completo:</label>
                                    <input
                                        type="text"
                                        value={user.fullName || ''}
                                        onChange={(e) => updateUser(index, 'fullName', e.target.value)}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                        placeholder="Nombre completo"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Correo:</label>
                                    <input
                                        type="email"
                                        value={user.email || ''}
                                        onChange={(e) => updateUser(index, 'email', e.target.value)}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                        placeholder="correo@ejemplo.com"
                                    />
                                </div>
                                {/* Ubicación removed visually as requested */}
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Empresa Dueña:</label>
                                    {/* Only show empresas whose ownerId matches the user's ownerId (or resolved owner) */}
                                    {(() => {
                                        // resolvedOwnerId must not change: use user.ownerId (the tenant) or fallback to currentUser owner
                                        const resolvedOwnerId = user.ownerId || (currentUser?.ownerId ?? (currentUser && currentUser.eliminate === false ? currentUser.id : '')) || '';
                                        const allowedEmpresas = empresasData.filter(e => (e?.ownerId || '') === resolvedOwnerId);
                                        return (
                                            <>
                                                <select
                                                    value={user.ownercompanie || ''}
                                                    onChange={(e) => updateUser(index, 'ownercompanie', e.target.value)}
                                                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                    style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                >
                                                    <option value="">Seleccionar empresa</option>
                                                    {allowedEmpresas.map((empresa) => (
                                                        <option key={empresa.id || empresa.name} value={empresa.name}>
                                                            {empresa.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {allowedEmpresas.length === 0 && (
                                                    <p className="text-[10px] sm:text-xs mt-1 text-yellow-600">No hay empresas disponibles.</p>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Contraseña:</label>
                                    {!user.id ? (
                                        // Usuario nuevo: mostrar campo de contraseña sin ocultar
                                        <input
                                            type="text"
                                            value={user.password || ''}
                                            onChange={(e) => updateUser(index, 'password', e.target.value)}
                                            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                            style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                            placeholder="Contraseña"
                                        />
                                    ) : changePasswordMode[getUserKey(user, index)] ? (
                                        // Usuario existente en modo cambio de contraseña
                                        <div className="space-y-1.5 sm:space-y-2">
                                            <div className="relative">
                                                <input
                                                    type={passwordVisibility[getUserKey(user, index)] ? 'text' : 'password'}
                                                    value={user.password || ''}
                                                    onChange={(e) => updateUser(index, 'password', e.target.value)}
                                                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 pr-10 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                                    style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                                    placeholder="Nueva contraseña"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => togglePasswordVisibility(user, index)}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                                    title={passwordVisibility[getUserKey(user, index)] ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                                >
                                                    {passwordVisibility[getUserKey(user, index)] ? (
                                                        <EyeOff className="w-4 h-4" />
                                                    ) : (
                                                        <Eye className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const key = getUserKey(user, index);
                                                    setChangePasswordMode(prev => ({ ...prev, [key]: false }));
                                                    // Restaurar contraseña original
                                                    const updated = [...usersData];
                                                    updated[index] = { ...updated[index], password: '' };
                                                    setUsersData(updated);
                                                    setPasswordStore(prev => ({ ...prev, [key]: passwordBaseline[key] ?? '' }));
                                                }}
                                                className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    ) : (
                                        // Usuario existente: mostrar mensaje informativo
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-0 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                                            <span className="text-xs sm:text-sm">Contraseña configurada</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const key = getUserKey(user, index);
                                                    setChangePasswordMode(prev => ({ ...prev, [key]: true }));
                                                }}
                                                className="text-[10px] sm:text-xs px-2 py-1 bg-[var(--primary)] text-white rounded hover:bg-[var(--button-hover)] transition-colors whitespace-nowrap flex items-center justify-center gap-1"
                                            >
                                                <Edit className="w-3 h-3" />
                                                Cambiar
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Rol:</label>
                                    <select
                                        value={user.role || 'user'} onChange={(e) => updateUser(index, 'role', e.target.value as 'admin' | 'user' | 'superadmin')}
                                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                        style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                    >
                                        {/* If currentUser is superadmin and this is a newly created local user (no id), do not show 'user' option */}
                                        {!(currentUser?.role === 'superadmin' && !user.id) && (
                                            <option value="user">Usuario</option>
                                        )}
                                        <option value="admin">Administrador</option>
                                        {currentUser?.role === 'superadmin' && (
                                            <option value="superadmin">Super Administrador</option>
                                        )}
                                    </select>
                                </div>
                                {/* Only show maxCompanies field if current user is superadmin */}
                                {user.role === 'admin' && user.eliminate === false && currentUser?.role === 'superadmin' && (
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium mb-1">Máx. Empresas:</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={user.maxCompanies ?? ''}
                                            onChange={(e) => updateUser(index, 'maxCompanies', e.target.value === '' ? undefined : Number(e.target.value))}
                                            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded-md text-xs sm:text-sm"
                                            style={{ background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                            placeholder="Máx. empresas"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-3 sm:mb-4">
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium mb-1">Estado:</label>
                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                        <input
                                            type="checkbox"
                                            checked={user.isActive ?? true}
                                            onChange={(e) => updateUser(index, 'isActive', e.target.checked)}
                                            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 bg-[var(--background)] border-[var(--border)] rounded focus:ring-blue-500"
                                        />
                                        <span className="text-xs sm:text-sm">Usuario activo</span>
                                    </div>
                                </div>
                            </div>

                            {/* Sección de Permisos */}
                            <div className="mb-3 sm:mb-4 p-2 sm:p-3 lg:p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                                    <h5 className="text-xs sm:text-sm font-medium" style={{ color: 'var(--foreground)' }}>Permisos del Usuario</h5>
                                    <span className="text-[10px] sm:text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                                        {user.role || 'user'}
                                    </span>
                                </div>
                                {renderUserPermissions(user, index)}
                                <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-[10px] sm:text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                        <strong>Nota:</strong> Edita los permisos y presiona &quot;Guardar&quot; para aplicar cambios.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-2">
                                <button
                                    onClick={() => saveIndividualUser(index)}
                                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                                    disabled={savingUserKey === getUserKey(user, index)}
                                >
                                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {savingUserKey === getUserKey(user, index) ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button
                                    onClick={() => removeUser(index)}
                                    className="px-3 py-2 sm:px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm sm:text-base"
                                    disabled={savingUserKey === getUserKey(user, index) || (currentUser?.role === 'admin' && (user.eliminate === false || user.eliminate === undefined))}
                                    title={currentUser?.role === 'admin' && (user.eliminate === false || user.eliminate === undefined) ? 'No puedes eliminar este usuario: marcado como protegido' : 'Eliminar Usuario'}
                                >
                                    Eliminar Usuario
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Schedule Report Content */}
            {activeFile === 'schedules' && (
                <ScheduleReportTab />
            )}            {/* CCSS Payment Configuration */}
            {activeFile === 'ccss' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
                        <div>
                            <h4 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                                Configuración de Pago CCSS
                            </h4>
                            <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                Configurar los montos de pago CCSS específicos para cada empresa
                            </p>
                        </div>
                        <button
                            onClick={addCcssConfig}
                            className="px-4 py-2 sm:px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold w-full sm:w-auto"
                        >
                            <span className="hidden sm:inline">Agregar Configuración</span>
                            <span className="sm:hidden">+ Config</span>
                        </button>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 sm:p-4">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                            </div>
                            <div>
                                <h5 className="font-medium text-blue-900 dark:text-blue-300">Configuración por Empresa</h5>
                                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                                    Cada empresa puede tener configuraciones CCSS específicas. Los valores se aplicarán automáticamente según la empresa seleccionada en los cálculos de nómina.
                                </p>
                            </div>
                        </div>
                    </div>

                    {getFlattenedCcssData().length === 0 ? (
                        <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-blue-900/20 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600">
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg">
                                <DollarSign className="w-10 h-10 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                                No hay configuraciones CCSS
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
                                Comienza creando tu primera configuración CCSS para gestionar los pagos de tus empresas de manera eficiente
                            </p>
                            <button
                                onClick={addCcssConfig}
                                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold text-lg flex items-center gap-3 mx-auto"
                            >
                                <Plus className="w-5 h-5" />
                                Crear Primera Configuración
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {getFlattenedCcssData().map((item, flatIndex) => (
                                <div key={`${item.config.id || item.configIndex}-${item.companyIndex}`} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-200 relative">
                                    {/* Header con botones */}
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start mb-4 sm:mb-6 gap-3 sm:gap-0">
                                        <div className="min-w-0 flex-1">
                                            <h5 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 truncate">
                                                Configuración CCSS #{flatIndex + 1}
                                            </h5>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                                {item.company.ownerCompanie || 'Nueva empresa'}
                                            </p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        // Crear una nueva copia del config completo con la company actualizada
                                                        const updatedConfig = {
                                                            ...item.config,
                                                            companie: item.config.companie.map((comp, idx) =>
                                                                idx === item.companyIndex ? item.company : comp
                                                            )
                                                        };
                                                        await CcssConfigService.updateCcssConfig(updatedConfig);
                                                        showToast(`Configuración para ${item.company.ownerCompanie || 'empresa'} guardada exitosamente`, 'success');
                                                        await loadData();
                                                    } catch (error) {
                                                        console.error('Error saving CCSS config:', error);
                                                        showToast('Error al guardar la configuración', 'error');
                                                    }
                                                }}
                                                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                <Check className="w-4 h-4" />
                                                <span className="hidden sm:inline">Guardar</span>
                                                <span className="sm:hidden">Save</span>
                                            </button>
                                            <button
                                                onClick={() => removeCcssConfig(item.configIndex, item.companyIndex)}
                                                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span className="hidden sm:inline">Eliminar</span>
                                                <span className="sm:hidden">Delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Selector de Empresa con mejor diseño */}
                                    <div className="mb-8">
                                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
                                            <label className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                                                <Building className="w-5 h-5" />
                                                Empresa:
                                            </label>
                                            <select
                                                value={item.company.ownerCompanie || ''}
                                                onChange={(e) => updateCcssConfig(item.configIndex, item.companyIndex, 'ownerCompanie', e.target.value)}
                                                className="w-full px-4 py-3 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                                            >
                                                <option value="">Seleccionar empresa...</option>
                                                {(() => {
                                                    if (!currentUser || currentUser.role === 'superadmin') {
                                                        return (empresasData || []).map((empresa, idx) => (
                                                            <option key={empresa.id || idx} value={empresa.name}>{empresa.name}</option>
                                                        ));
                                                    }

                                                    return (empresasData || [])
                                                        .filter(empresa => {
                                                            if (!empresa || !empresa.ownerId) return false;
                                                            if (actorOwnerIdSet.size > 0) {
                                                                return actorOwnerIdSet.has(String(empresa.ownerId));
                                                            }
                                                            return (
                                                                (currentUser.id && String(empresa.ownerId) === String(currentUser.id)) ||
                                                                (currentUser.ownerId && String(empresa.ownerId) === String(currentUser.ownerId))
                                                            );
                                                        })
                                                        .map((empresa, idx) => (
                                                            <option key={empresa.id || idx} value={empresa.name}>{empresa.name}</option>
                                                        ));
                                                })()}
                                            </select>

                                        </div>
                                    </div>

                                    {/* Grid de valores CCSS mejorado */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                                        {/* Tiempo Completo */}
                                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                                                    <Clock className="w-6 h-6 text-white" />
                                                </div>
                                                <div>
                                                    <h6 className="font-bold text-green-900 dark:text-green-200">Tiempo Completo</h6>
                                                    <p className="text-xs text-green-700 dark:text-green-400">(TC)</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-green-600 dark:text-green-400 font-bold text-lg">₡</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={item.company.tc || 0}
                                                    onChange={(e) => updateCcssConfig(item.configIndex, item.companyIndex, 'tc', parseFloat(e.target.value) || 0)}
                                                    className="w-full pl-10 pr-4 py-3 border-2 border-green-300 dark:border-green-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                                                    placeholder="11017.39"
                                                />
                                            </div>
                                        </div>

                                        {/* Medio Tiempo */}
                                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                                                    <Clock className="w-6 h-6 text-white" />
                                                </div>
                                                <div>
                                                    <h6 className="font-bold text-orange-900 dark:text-orange-200">Medio Tiempo</h6>
                                                    <p className="text-xs text-orange-700 dark:text-orange-400">(MT)</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-600 dark:text-orange-400 font-bold text-lg">₡</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={item.company.mt || 0}
                                                    onChange={(e) => updateCcssConfig(item.configIndex, item.companyIndex, 'mt', parseFloat(e.target.value) || 0)}
                                                    className="w-full pl-10 pr-4 py-3 border-2 border-orange-300 dark:border-orange-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
                                                    placeholder="3672.46"
                                                />
                                            </div>
                                        </div>

                                        {/* Valor por Hora */}
                                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                                    <DollarSign className="w-6 h-6 text-white" />
                                                </div>
                                                <div>
                                                    <h6 className="font-bold text-blue-900 dark:text-blue-200">Valor por Hora</h6>
                                                    <p className="text-xs text-blue-700 dark:text-blue-400">Tarifa horaria</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-600 dark:text-blue-400 font-bold text-lg">₡</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={item.company.valorhora || 0}
                                                    onChange={(e) => updateCcssConfig(item.configIndex, item.companyIndex, 'valorhora', parseFloat(e.target.value) || 0)}
                                                    className="w-full pl-10 pr-4 py-3 border-2 border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                                    placeholder="1441"
                                                />
                                            </div>
                                        </div>

                                        {/* Hora Bruta */}
                                        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg">
                                                    <DollarSign className="w-6 h-6 text-white" />
                                                </div>
                                                <div>
                                                    <h6 className="font-bold text-purple-900 dark:text-purple-200">Hora Bruta</h6>
                                                    <p className="text-xs text-purple-700 dark:text-purple-400">Tarifa bruta</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-600 dark:text-purple-400 font-bold text-lg">₡</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={item.company.horabruta || 0}
                                                    onChange={(e) => updateCcssConfig(item.configIndex, item.companyIndex, 'horabruta', parseFloat(e.target.value) || 0)}
                                                    className="w-full pl-10 pr-4 py-3 border-2 border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                                                    placeholder="1529.62"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Botón global de guardado mejorado */}
                    {ccssConfigsData.length > 0 && (
                        <div className="flex justify-center pt-8">
                            <button
                                onClick={saveData}
                                disabled={!hasChanges || isSaving}
                                className={`px-8 py-4 rounded-xl flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold text-lg ${hasChanges && !isSaving
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <Save className="w-6 h-6" />
                                {isSaving ? 'Guardando...' : 'Guardar Todas las Configuraciones'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <ExportModal open={showExportModal} onClose={closeExportModal} />

            {/* Modal de confirmación */}
            <ConfirmModal
                open={confirmModal.open}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText="Eliminar"
                cancelText="Cancelar"
                singleButton={confirmModal.singleButton}
                singleButtonText={confirmModal.singleButtonText}
                loading={confirmModal.loading}
                onConfirm={handleConfirm}
                onCancel={closeConfirmModal}
                actionType="delete"
            />
        </div>
    );
}
