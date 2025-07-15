import React from 'react';
import { Navbar, Container, Form } from 'react-bootstrap';

const Header = ({ theme, toggleTheme, wrapTextEnabled, toggleWrapText }) => {
  const navbarVariant = theme === 'dark' ? 'dark' : 'light';
  const navbarBg = theme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <Navbar expand="lg" fixed="top" className="custom-header">
        <Container>
          <Navbar.Brand href="#" style={{ fontWeight: 'bold', fontSize: '1.5rem' }}>{`{ JSON Tools }`}</Navbar.Brand>
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
      </>
  );
};

export default Header;
