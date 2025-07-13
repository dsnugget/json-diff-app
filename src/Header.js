import React from 'react';
import { Navbar, Container, Form } from 'react-bootstrap';

const Header = ({ theme, toggleTheme, wrapTextEnabled, toggleWrapText }) => {
  const navbarVariant = theme === 'dark' ? 'dark' : 'light';
  const navbarBg = theme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <Navbar bg={navbarBg} variant={navbarVariant} expand="lg" fixed="top">
        <Container>
          <Navbar.Brand href="#" style={{ fontWeight: 'bold' }}>JSON Tools</Navbar.Brand>
          <Form className="d-flex align-items-center">
            <Form.Check 
              type="switch"
              id="wrap-text-switch"
              label="Wrap Text"
              checked={wrapTextEnabled}
              onChange={toggleWrapText}
              className="me-3"
            />
            <Form.Check 
              type="switch"
              id="theme-switch"
              label={theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              checked={theme === 'dark'}
              onChange={toggleTheme}
            />
          </Form>
        </Container>
      </Navbar>
      <div style={{ height: '3px', backgroundColor: '#007bff', width: '100%', position: 'fixed', top: '56px', zIndex: '1030' }}></div>
    </>
  );
};

export default Header;
