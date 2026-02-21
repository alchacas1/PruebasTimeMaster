'use client'

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';

type ActiveTab = 'scanner' | 'calculator' | 'converter' | 'xml' | 'cashcounter' | 'recetas' | 'agregarproducto' | 'timingcontrol' | 'controlhorario' | 'empleados' | 'calculohorasprecios' | 'supplierorders' | 'histoscans' | 'scanhistory' | 'edit' | 'solicitud' | 'fondogeneral' | 'agregarproveedor' | 'reportes';

export default function HeaderWrapper() {
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();

  // Ensure component is mounted on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Listen to hash changes and pathname changes to update active tab
  useEffect(() => {
    if (!isClient) return;

    const updateTabFromHash = () => {
      // Check if we're on a specific page that should have an active tab
      if (pathname === '/edit') {
        setActiveTab('edit');
        return;
      }

      // Check hash for hash-based navigation
      const hash = window.location.hash.replace('#', '') as ActiveTab;
      const validTabs = [
        'scanner', 'calculator', 'converter', 'xml', 'cashcounter', 'timingcontrol', 'controlhorario', 'empleados', 'recetas', 'agregarproducto', 'calculohorasprecios', 'supplierorders', 'histoscans', 'scanhistory', 'edit', 'solicitud', 'fondogeneral', 'agregarproveedor', 'reportes'
      ];
      if (validTabs.includes(hash)) {
        // Map scanhistory hash to histoscans tab for header highlighting
        if (hash === 'scanhistory') {
          setActiveTab('histoscans');
        } else {
          setActiveTab(hash);
        }
      } else {
        setActiveTab(null);
      }
    };

    updateTabFromHash();

    const handleHashChange = () => {
      updateTabFromHash();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [isClient, pathname]);

  return <Header activeTab={activeTab} onTabChange={setActiveTab} />;
}